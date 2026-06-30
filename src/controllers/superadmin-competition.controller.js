import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const listSuperadminCompetitionBusinessPartners = asyncHandler(async (req, res) => {
  const { competitionId } = req.params;

  // Business partners mapped to this competition
  const mappings = await prisma.competition.findFirst({ where: { id: competitionId, tenantId: req.auth.tenantId }, select: { businessPartnerMappings: { select: { businessPartner: { select: { id: true, name: true, code: true } } } } } });
  const bps = (mappings?.businessPartnerMappings || []).map((m) => m.businessPartner).filter(Boolean);

  // Gather basic aggregates per BP
  const rows = [];
  for (const bp of bps) {
    const franchises = await prisma.franchiseProfile.findMany({ where: { tenantId: req.auth.tenantId, businessPartnerId: bp.id }, select: { id: true } });
    const franchiseIds = franchises.map((f) => f.id);
    const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: { in: franchiseIds } }, select: { id: true } });
    const centerIds = centers.map((c) => c.id);

    const students = await prisma.competitionEnrollment.count({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: centerIds } } } });
    const tempStudents = await prisma.competitionEnrollment.count({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: centerIds }, isTemporaryExam: true } } });

    const submissions = await prisma.competitionCenterSubmission.findMany({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds } } });
    const status = submissions.find((s) => s.status === "SUBMITTED")
      ? "SUBMITTED"
      : submissions.find((s) => s.status === "APPROVED")
      ? "APPROVED"
      : submissions.find((s) => s.status === "REOPENED")
      ? "RETURNED"
      : null;

    const submissionDate = submissions.length ? submissions[submissions.length - 1].submittedAt : null;

    rows.push({ businessPartnerId: bp.id, businessPartnerName: bp.name, franchises: franchiseIds.length, centers: centerIds.length, students, temporaryStudents: tempStudents, submissionDate, status });
  }

  const summary = {
    businessPartners: rows.length,
    franchises: rows.reduce((s, r) => s + r.franchises, 0),
    centers: rows.reduce((s, r) => s + r.centers, 0),
    students: rows.reduce((s, r) => s + r.students, 0),
    temporaryStudents: rows.reduce((s, r) => s + r.temporaryStudents, 0),
    approvedStudents: 0,
    returnedStudents: 0
  };

  return res.apiSuccess("BP competition summary fetched", { summary, businessPartners: rows });
});

const getSuperadminCompetitionBusinessPartnerDetail = asyncHandler(async (req, res) => {
  const { competitionId, bpId } = req.params;

  const franchises = await prisma.franchiseProfile.findMany({ where: { tenantId: req.auth.tenantId, businessPartnerId: bpId }, select: { id: true, name: true } });
  const franchiseIds = franchises.map((f) => f.id);
  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: { in: franchiseIds } }, select: { id: true, name: true, franchiseProfileId: true } });
  const centerIds = centers.map((c) => c.id);

  const registrations = await prisma.competitionEnrollment.findMany({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: centerIds } } }, select: { student: { select: { id: true, firstName: true, lastName: true, currentTeacherUserId: true, hierarchyNodeId: true, isTemporaryExam: true } }, levelId: true, enrolledAt: true } });

  const levelSummary = {};
  const teacherMap = new Map();
  for (const r of registrations) {
    levelSummary[r.levelId] = (levelSummary[r.levelId] || 0) + 1;
    if (r.student.currentTeacherUserId) {
      teacherMap.set(r.student.currentTeacherUserId, (teacherMap.get(r.student.currentTeacherUserId) || 0) + 1);
    }
  }

  const tempStudents = registrations.filter((r) => r.student.isTemporaryExam).map((r) => r.student);

  const submissions = await prisma.competitionCenterSubmission.findMany({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds } } });

  return res.apiSuccess("BP detail fetched for superadmin", { franchises, centers, registrations, levelSummary, teachers: Array.from(teacherMap.entries()).map(([teacherId, count]) => ({ teacherId, count })), temporaryStudents: tempStudents, submissions });
});

const returnSuperadminCompetitionBusinessPartner = asyncHandler(async (req, res) => {
  const { competitionId, bpId } = req.params;
  const { remark } = req.body;

  if (!remark || !String(remark).trim()) {
    return res.apiError(400, "remark is required", "VALIDATION_ERROR");
  }

  const franchises = await prisma.franchiseProfile.findMany({ where: { tenantId: req.auth.tenantId, businessPartnerId: bpId }, select: { id: true } });
  const franchiseIds = franchises.map((f) => f.id);
  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: { in: franchiseIds } }, select: { id: true } });
  const centerIds = centers.map((c) => c.id);

  const created = [];
  await prisma.$transaction(async (tx) => {
    for (const centerId of centerIds) {
      const s = await tx.competitionCenterSubmission.create({ data: { tenantId: req.auth.tenantId, competitionId, centerId, status: "REOPENED", remark: String(remark).trim(), submittedByUserId: req.auth.userId } });
      created.push(s);
    }

    await tx.competitionStageTransition.create({ data: { tenantId: req.auth.tenantId, competitionId, fromStage: "SUPERADMIN_APPROVAL", toStage: "BUSINESS_PARTNER_RETURNED", action: "REJECT", reason: remark || null, actedByUserId: req.auth.userId } });
  });

  return res.apiSuccess("Business partner returned for edits", created);
});

const approveSuperadminCompetitionBusinessPartner = asyncHandler(async (req, res) => {
  const { competitionId, bpId } = req.params;

  const franchises = await prisma.franchiseProfile.findMany({ where: { tenantId: req.auth.tenantId, businessPartnerId: bpId }, select: { id: true } });
  const franchiseIds = franchises.map((f) => f.id);
  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: { in: franchiseIds } }, select: { id: true } });
  const centerIds = centers.map((c) => c.id);

  const created = [];
  await prisma.$transaction(async (tx) => {
    const submittedCenters = await tx.competitionCenterSubmission.findMany({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds }, status: "SUBMITTED" }, select: { centerId: true } });
    const toApprove = Array.from(new Set(submittedCenters.map((s) => s.centerId)));

    for (const centerId of toApprove) {
      const s = await tx.competitionCenterSubmission.create({ data: { tenantId: req.auth.tenantId, competitionId, centerId, status: "APPROVED", submittedByUserId: req.auth.userId } });
      created.push(s);
    }

    await tx.competitionStageTransition.create({ data: { tenantId: req.auth.tenantId, competitionId, fromStage: "SUPERADMIN_APPROVAL", toStage: "BUSINESS_PARTNER_APPROVED", action: "FORWARD", reason: null, actedByUserId: req.auth.userId } });
  });

  return res.apiSuccess("Business partner approved by superadmin", created);
});

export {
  listSuperadminCompetitionBusinessPartners,
  getSuperadminCompetitionBusinessPartnerDetail,
  returnSuperadminCompetitionBusinessPartner,
  approveSuperadminCompetitionBusinessPartner
};
