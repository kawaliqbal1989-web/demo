import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { buildCertificateBrandingSnapshotForStudent } from "./branding.service.js";

function safeJson(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function certificateNumber({ competitionCode, admissionNo, levelRank }) {
  const code = String(competitionCode || "COMP").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 20) || "COMP";
  const student = String(admissionNo || "STUDENT").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 20) || "STUDENT";
  const level = String(levelRank || "L").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8) || "L";
  return `COMP-${code}-${student}-${level}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function generateCompetitionCertificates({
  competitionId,
  tenantId,
  issuedByUserId,
  db = prisma,
  brandingSnapshotBuilder = buildCertificateBrandingSnapshotForStudent
}) {
  const competition = await db.competition.findFirst({
    where: { id: competitionId, tenantId, resultStatus: "PUBLISHED" },
    select: {
      id: true,
      code: true,
      title: true,
      resultStatus: true,
      resultPublishedAt: true,
      startsAt: true,
      endsAt: true
    }
  });
  if (!competition) {
    const error = new Error("Competition results must be published before certificates are generated");
    error.statusCode = 409;
    error.errorCode = "COMPETITION_RESULTS_NOT_PUBLISHED";
    throw error;
  }

  const enrollments = await db.competitionEnrollment.findMany({
    where: {
      tenantId,
      competitionId,
      isActive: true,
      approvedAt: { not: null },
      resultSubmissionId: { not: null },
      resultCalculatedAt: { not: null }
    },
    select: {
      id: true,
      studentId: true,
      enrolledLevelId: true,
      isTemporary: true,
      rank: true,
      totalScore: true,
      resultCompletionTimeSeconds: true,
      resultSubmissionId: true,
      resultCalculatedAt: true,
      student: {
        select: { admissionNo: true, firstName: true, lastName: true }
      },
      competitionCourseLevel: {
        select: {
          id: true,
          levelNumber: true,
          level: { select: { id: true, name: true, rank: true } },
          competitionCourse: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });

  if (!enrollments.length) {
    return { eligible: 0, created: 0, existing: 0, reactivated: 0 };
  }

  const existing = await db.certificate.findMany({
    where: { competitionEnrollmentId: { in: enrollments.map((row) => row.id) } },
    select: {
      id: true,
      competitionEnrollmentId: true,
      status: true,
      reason: true
    }
  });
  const existingIds = new Set(existing.map((row) => row.competitionEnrollmentId));
  const pending = enrollments.filter((row) => !existingIds.has(row.id));
  const reactivatableIds = existing
    .filter(
      (row) =>
        row.status === "REVOKED" &&
        row.reason === "Competition results unpublished"
    )
    .map((row) => row.id);

  let reactivated = 0;
  if (reactivatableIds.length) {
    const reactivation = await db.certificate.updateMany({
      where: {
        id: { in: reactivatableIds },
        tenantId,
        competitionId,
        status: "REVOKED",
        reason: "Competition results unpublished"
      },
      data: {
        status: "ISSUED",
        revokedAt: null,
        revokedByUserId: null,
        reason: "Competition result published"
      }
    });
    reactivated = Number(reactivation?.count || 0);
  }

  const rows = [];
  for (const enrollment of pending) {
    const course = enrollment.competitionCourseLevel?.competitionCourse || null;
    const level = enrollment.competitionCourseLevel?.level || null;
    let brandingSnapshot = null;
    try {
      brandingSnapshot = await brandingSnapshotBuilder(enrollment.studentId, tenantId);
    } catch (error) {
      // Branding is optional certificate decoration. A partially migrated legacy
      // branding schema must never block result publication or certificate issue.
      if (error?.name !== "PrismaClientValidationError" && error?.code !== "P2021" && error?.code !== "P2022") {
        throw error;
      }
    }
    const studentName = [enrollment.student?.firstName, enrollment.student?.lastName]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
    const competitionSnapshot = {
      id: competition.id,
      code: competition.code,
      title: competition.title,
      startsAt: competition.startsAt,
      endsAt: competition.endsAt,
      resultPublishedAt: competition.resultPublishedAt
    };
    const resultSnapshot = {
      participationId: enrollment.id,
      submissionId: enrollment.resultSubmissionId,
      rank: enrollment.rank,
      totalScore: enrollment.totalScore === null ? null : Number(enrollment.totalScore),
      completionTimeSeconds: enrollment.resultCompletionTimeSeconds,
      calculatedAt: enrollment.resultCalculatedAt,
      isTemporary: enrollment.isTemporary
    };
    const courseSnapshot = course ? { id: course.id, code: course.code, name: course.name } : null;
    const levelSnapshot = {
      id: level?.id || enrollment.enrolledLevelId,
      name: level?.name || `Level ${enrollment.competitionCourseLevel?.levelNumber || ""}`.trim(),
      rank: level?.rank ?? enrollment.competitionCourseLevel?.levelNumber ?? null
    };

    rows.push({
      id: crypto.randomUUID(),
      tenantId,
      certificateNumber: certificateNumber({
        competitionCode: competition.code,
        admissionNo: enrollment.student?.admissionNo,
        levelRank: levelSnapshot.rank
      }),
      status: "ISSUED",
      studentId: enrollment.studentId,
      levelId: levelSnapshot.id,
      courseId: course?.id || null,
      competitionId,
      competitionEnrollmentId: enrollment.id,
      issuedByUserId,
      reason: "Competition result published",
      courseSnapshot,
      levelSnapshot,
      brandingSnapshot,
      competitionSnapshot,
      resultSnapshot,
      verificationToken: crypto.randomUUID(),
      metadata: safeJson({
        source: "COMPETITION",
        studentName,
        admissionNo: enrollment.student?.admissionNo || null,
        competitionSnapshot,
        resultSnapshot
      })
    });
  }

  if (rows.length) {
    await db.certificate.createMany({ data: rows, skipDuplicates: true });
  }

  const total = await db.certificate.count({
    where: { competitionEnrollmentId: { in: enrollments.map((row) => row.id) } }
  });
  return {
    eligible: enrollments.length,
    created: Math.max(0, total - existing.length),
    existing: Math.max(0, existing.length - reactivated),
    reactivated
  };
}

async function revokeCompetitionCertificates({
  competitionId,
  tenantId,
  revokedByUserId,
  db = prisma
}) {
  const revokedAt = new Date();
  const result = await db.certificate.updateMany({
    where: {
      tenantId,
      competitionId,
      status: "ISSUED"
    },
    data: {
      status: "REVOKED",
      revokedAt,
      revokedByUserId,
      reason: "Competition results unpublished"
    }
  });

  return {
    revoked: Number(result?.count || 0),
    revokedAt
  };
}

export { generateCompetitionCertificates, revokeCompetitionCertificates };
