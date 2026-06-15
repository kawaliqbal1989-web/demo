import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../helpers/test-helpers.js";
import { authHeader, ensureAuthUser, loginAs, randomId } from "../helpers/test-helpers.js";

const http = request(app);

async function createEmbargoAnalyticsContext() {
  const suffix = randomId("exa");
  const tenant = await prisma.tenant.create({
    data: {
      name: `Exam Analytics ${suffix}`,
      code: `EA_${suffix}`
    }
  });

  const centerNode = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `Center ${suffix}`,
      code: `CTR_${suffix}`,
      type: "BRANCH"
    }
  });

  const level = await prisma.level.create({
    data: {
      tenantId: tenant.id,
      name: `Level ${suffix}`,
      rank: 1,
      description: "Exam analytics embargo test level"
    }
  });

  const centerEmail = `center.${suffix}@example.com`;
  const teacherEmail = `teacher.${suffix}@example.com`;

  const centerUser = await ensureAuthUser({
    tenantCode: tenant.code,
    email: centerEmail,
    username: `CE_${suffix}`,
    role: "CENTER",
    hierarchyNodeCode: centerNode.code
  });

  const teacherUser = await ensureAuthUser({
    tenantCode: tenant.code,
    email: teacherEmail,
    username: `TE_${suffix}`,
    role: "TEACHER",
    hierarchyNodeCode: centerNode.code,
    parentUserId: centerUser.id
  });

  const businessPartner = await prisma.businessPartner.create({
    data: {
      tenantId: tenant.id,
      name: `Partner ${suffix}`,
      code: `BP_${suffix}`,
      displayName: `Partner ${suffix}`,
      status: "ACTIVE",
      isActive: true,
      contactEmail: `bp.${suffix}@example.com`,
      hierarchyNodeId: centerNode.id,
      subscriptionStatus: "ACTIVE",
      createdByUserId: centerUser.id
    }
  });

  const student = await prisma.student.create({
    data: {
      tenantId: tenant.id,
      admissionNo: `ST_${suffix}`,
      firstName: "Embargo",
      lastName: "Student",
      hierarchyNodeId: centerNode.id,
      levelId: level.id,
      currentTeacherUserId: teacherUser.id,
      isActive: true
    }
  });

  const now = Date.now();
  const draftExamCycle = await prisma.examCycle.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: businessPartner.id,
      name: `Draft Cycle ${suffix}`,
      code: `DR_${suffix}`,
      enrollmentStartAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      enrollmentEndAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
      practiceStartAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      examStartsAt: new Date(now - 24 * 60 * 60 * 1000),
      examEndsAt: new Date(now + 24 * 60 * 60 * 1000),
      examDurationMinutes: 45,
      attemptLimit: 1,
      createdByUserId: centerUser.id,
      resultStatus: "DRAFT"
    }
  });

  const publishedExamCycle = await prisma.examCycle.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: businessPartner.id,
      name: `Published Cycle ${suffix}`,
      code: `PB_${suffix}`,
      enrollmentStartAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      enrollmentEndAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
      practiceStartAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      examStartsAt: new Date(now - 24 * 60 * 60 * 1000),
      examEndsAt: new Date(now + 24 * 60 * 60 * 1000),
      examDurationMinutes: 45,
      attemptLimit: 1,
      createdByUserId: centerUser.id,
      resultStatus: "PUBLISHED",
      resultPublishedAt: new Date(now - 60 * 60 * 1000)
    }
  });

  await prisma.examEnrollmentEntry.createMany({
    data: [
      {
        tenantId: tenant.id,
        examCycleId: draftExamCycle.id,
        studentId: student.id,
        enrolledLevelId: level.id,
        isTemporary: false,
        sourceTeacherUserId: teacherUser.id,
        createdByUserId: centerUser.id
      },
      {
        tenantId: tenant.id,
        examCycleId: publishedExamCycle.id,
        studentId: student.id,
        enrolledLevelId: level.id,
        isTemporary: false,
        sourceTeacherUserId: teacherUser.id,
        createdByUserId: centerUser.id
      }
    ]
  });

  const draftWorksheet = await prisma.worksheet.create({
    data: {
      tenantId: tenant.id,
      title: `Draft Worksheet ${suffix}`,
      description: "Draft exam worksheet",
      levelId: level.id,
      createdByUserId: centerUser.id,
      isPublished: true,
      generationMode: "EXAM",
      examCycleId: draftExamCycle.id
    }
  });

  const publishedWorksheet = await prisma.worksheet.create({
    data: {
      tenantId: tenant.id,
      title: `Published Worksheet ${suffix}`,
      description: "Published exam worksheet",
      levelId: level.id,
      createdByUserId: centerUser.id,
      isPublished: true,
      generationMode: "EXAM",
      examCycleId: publishedExamCycle.id
    }
  });

  await prisma.worksheetSubmission.createMany({
    data: [
      {
        tenantId: tenant.id,
        worksheetId: draftWorksheet.id,
        studentId: student.id,
        score: 19,
        status: "REVIEWED",
        submittedAt: new Date(now - 30 * 60 * 1000),
        finalSubmittedAt: new Date(now - 30 * 60 * 1000),
        totalQuestions: 20
      },
      {
        tenantId: tenant.id,
        worksheetId: publishedWorksheet.id,
        studentId: student.id,
        score: 87,
        status: "REVIEWED",
        submittedAt: new Date(now - 15 * 60 * 1000),
        finalSubmittedAt: new Date(now - 15 * 60 * 1000),
        totalQuestions: 20
      }
    ]
  });

  const centerLogin = await loginAs({ tenantCode: tenant.code, email: centerEmail });
  const teacherLogin = await loginAs({ tenantCode: tenant.code, email: teacherEmail });

  return {
    tenantId: tenant.id,
    centerToken: centerLogin.body?.data?.access_token,
    teacherToken: teacherLogin.body?.data?.access_token,
    draftCode: draftExamCycle.code,
    publishedCode: publishedExamCycle.code
  };
}

describe("exam analytics embargo enforcement", () => {
  test("center and teacher exam analytics APIs and CSV exports hide unpublished exam scores", async () => {
    const ctx = await createEmbargoAnalyticsContext();
    try {
      const centerJson = await http.get("/api/center/analytics/exams").set(authHeader(ctx.centerToken));
      expect(centerJson.status).toBe(200);
      const centerItems = centerJson.body?.data?.items || [];

      const centerDraft = centerItems.find((row) => row.examCycleCode === ctx.draftCode);
      const centerPublished = centerItems.find((row) => row.examCycleCode === ctx.publishedCode);

      expect(centerDraft).toBeTruthy();
      expect(centerDraft.avgScore).toBe(0);
      expect(centerDraft.totalAttempts).toBe(0);

      expect(centerPublished).toBeTruthy();
      expect(centerPublished.avgScore).toBe(87);
      expect(centerPublished.totalAttempts).toBe(1);

      const centerCsv = await http.get("/api/center/analytics/exams/export.csv").set(authHeader(ctx.centerToken));
      expect(centerCsv.status).toBe(200);
      expect(String(centerCsv.text)).toContain(`${ctx.draftCode},0,0,DRAFT`);
      expect(String(centerCsv.text)).toContain(`${ctx.publishedCode},87,1,PUBLISHED`);

      const teacherJson = await http.get("/api/teacher/analytics/exams").set(authHeader(ctx.teacherToken));
      expect(teacherJson.status).toBe(200);
      const teacherItems = teacherJson.body?.data?.items || [];

      const teacherDraft = teacherItems.find((row) => row.examCycleCode === ctx.draftCode);
      const teacherPublished = teacherItems.find((row) => row.examCycleCode === ctx.publishedCode);

      expect(teacherDraft).toBeTruthy();
      expect(teacherDraft.avgScore).toBe(0);
      expect(teacherDraft.totalAttempts).toBe(0);

      expect(teacherPublished).toBeTruthy();
      expect(teacherPublished.avgScore).toBe(87);
      expect(teacherPublished.totalAttempts).toBe(1);

      const teacherCsv = await http.get("/api/teacher/analytics/exams/export.csv").set(authHeader(ctx.teacherToken));
      expect(teacherCsv.status).toBe(200);
      expect(String(teacherCsv.text)).toContain(`${ctx.draftCode},0,0,DRAFT`);
      expect(String(teacherCsv.text)).toContain(`${ctx.publishedCode},87,1,PUBLISHED`);
    } finally {
      await prisma.worksheetSubmission.deleteMany({ where: { tenantId: ctx.tenantId } });
      await prisma.worksheet.deleteMany({ where: { tenantId: ctx.tenantId } });
      await prisma.examEnrollmentEntry.deleteMany({ where: { tenantId: ctx.tenantId } });
      await prisma.examCycle.deleteMany({ where: { tenantId: ctx.tenantId } });
      await prisma.student.deleteMany({ where: { tenantId: ctx.tenantId } });
    }
  });
});
