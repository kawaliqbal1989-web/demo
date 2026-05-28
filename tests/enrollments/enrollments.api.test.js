import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { authHeader, ensureAuthUser, loginAs, randomId } from "../helpers/test-helpers.js";

const http = request(app);

describe("enrollments API", () => {
  test("blocks creating a second active enrollment for the same student in the same center", async () => {
    const suffix = randomId("enroll");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Enrollment Tenant ${suffix}`,
        code: `ENR_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Enrollment Center ${suffix}`,
        code: `ENC_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Enrollment Level ${suffix}`,
        rank: 1,
        description: "Enrollment API test level"
      }
    });

    const centerEmail = `center.${suffix}@example.com`;

    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CEN_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const teacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `teacher.${suffix}@example.com`,
      username: `TEN_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const sourceBatch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Source Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: teacher.id
      }
    });

    const targetBatch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Target Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: teacher.id
      }
    });

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST_${suffix}`,
        firstName: "Policy",
        lastName: "Student",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        currentTeacherUserId: teacher.id,
        isActive: true
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: student.id,
        batchId: sourceBatch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .post("/api/enrollments")
      .set(authHeader(centerLogin.body?.data?.access_token))
      .send({
        studentId: student.id,
        batchId: targetBatch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE"
      });

    expect(res.statusCode).toBe(409);
    expect(res.body?.errorCode || res.body?.error_code).toBe("ENROLLMENT_EXISTS");
    expect(JSON.stringify(res.body)).toContain("active enrollment");
  });

  test("lists only students without active enrollments when notEnrolledOnly is enabled", async () => {
    const suffix = randomId("eligible");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Eligible Tenant ${suffix}`,
        code: `ELG_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Eligible Center ${suffix}`,
        code: `ELC_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Eligible Level ${suffix}`,
        rank: 1,
        description: "Eligible students test level"
      }
    });

    const centerEmail = `eligible.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CEL_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const teacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `eligible.teacher.${suffix}@example.com`,
      username: `TEL_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Eligible Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: teacher.id
      }
    });

    const enrolledStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `EA_${suffix}`,
        firstName: "Active",
        lastName: "Enrollment",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        currentTeacherUserId: teacher.id,
        isActive: true
      }
    });

    const availableStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `NA_${suffix}`,
        firstName: "Not",
        lastName: "Enrolled",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: enrolledStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .get("/api/students?limit=20&offset=0&status=ACTIVE&notEnrolledOnly=1")
      .set(authHeader(centerLogin.body?.data?.access_token));

    expect(res.statusCode).toBe(200);
    const items = Array.isArray(res.body?.data) ? res.body.data : [];
    const ids = items.map((item) => item.id);
    expect(ids).toContain(availableStudent.id);
    expect(ids).not.toContain(enrolledStudent.id);
  });

  test("filters enrollments by teacher, level, status, and search query", async () => {
    const suffix = randomId("filters");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Filter Tenant ${suffix}`,
        code: `FLT_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Filter Center ${suffix}`,
        code: `FLC_${suffix}`,
        type: "BRANCH"
      }
    });

    const levelOne = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Filter Level One ${suffix}`,
        rank: 1,
        description: "Filter test level one"
      }
    });

    const levelTwo = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Filter Level Two ${suffix}`,
        rank: 2,
        description: "Filter test level two"
      }
    });

    const centerEmail = `filter.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CFL_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const primaryTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `filter.teacher.primary.${suffix}@example.com`,
      username: `TFP_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const secondaryTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `filter.teacher.secondary.${suffix}@example.com`,
      username: `TFS_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Filter Batch ${suffix}`,
        levelId: levelOne.id,
        primaryTeacherUserId: primaryTeacher.id
      }
    });

    const alphaStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ALPHA_${suffix}`,
        firstName: "Alpha",
        lastName: "Match",
        hierarchyNodeId: centerNode.id,
        levelId: levelOne.id,
        currentTeacherUserId: primaryTeacher.id,
        isActive: true
      }
    });

    const betaStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `BETA_${suffix}`,
        firstName: "Beta",
        lastName: "Mismatch",
        hierarchyNodeId: centerNode.id,
        levelId: levelTwo.id,
        currentTeacherUserId: secondaryTeacher.id,
        isActive: true
      }
    });

    await prisma.enrollment.createMany({
      data: [
        {
          tenantId: tenant.id,
          hierarchyNodeId: centerNode.id,
          studentId: alphaStudent.id,
          batchId: batch.id,
          assignedTeacherUserId: primaryTeacher.id,
          levelId: levelOne.id,
          status: "ACTIVE"
        },
        {
          tenantId: tenant.id,
          hierarchyNodeId: centerNode.id,
          studentId: betaStudent.id,
          batchId: batch.id,
          assignedTeacherUserId: secondaryTeacher.id,
          levelId: levelTwo.id,
          status: "INACTIVE"
        }
      ]
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .get(`/api/enrollments?batchId=${encodeURIComponent(batch.id)}&teacherUserId=${encodeURIComponent(primaryTeacher.id)}&levelId=${encodeURIComponent(levelOne.id)}&status=ACTIVE&q=Alpha`)
      .set(authHeader(centerLogin.body?.data?.access_token));

    expect(res.statusCode).toBe(200);
    const items = Array.isArray(res.body?.data?.items) ? res.body.data.items : [];
    expect(items).toHaveLength(1);
    expect(items[0]?.student?.id).toBe(alphaStudent.id);
    expect(items[0]?.assignedTeacher?.id).toBe(primaryTeacher.id);
    expect(items[0]?.level?.id).toBe(levelOne.id);
  });

  test("filters enrollments by created date range and student active status", async () => {
    const suffix = randomId("dates");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Date Tenant ${suffix}`,
        code: `DAT_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Date Center ${suffix}`,
        code: `DAC_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Date Level ${suffix}`,
        rank: 1,
        description: "Date filter level"
      }
    });

    const centerEmail = `date.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CDT_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const teacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `date.teacher.${suffix}@example.com`,
      username: `TDT_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Date Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: teacher.id
      }
    });

    const activeStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `DSA_${suffix}`,
        firstName: "Recent",
        lastName: "Active",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        currentTeacherUserId: teacher.id,
        isActive: true
      }
    });

    const inactiveStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `DSI_${suffix}`,
        firstName: "Older",
        lastName: "Inactive",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        currentTeacherUserId: teacher.id,
        isActive: false
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: activeStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE",
        createdAt: new Date("2026-05-15T09:00:00.000Z")
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: inactiveStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE",
        createdAt: new Date("2026-04-10T09:00:00.000Z")
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .get(`/api/enrollments?batchId=${encodeURIComponent(batch.id)}&studentActive=ACTIVE&from=2026-05-01&to=2026-05-31`)
      .set(authHeader(centerLogin.body?.data?.access_token));

    expect(res.statusCode).toBe(200);
    const items = Array.isArray(res.body?.data?.items) ? res.body.data.items : [];
    expect(items).toHaveLength(1);
    expect(items[0]?.student?.id).toBe(activeStudent.id);
    expect(items[0]?.student?.isActive).toBe(true);
  });

  test("filters enrollments by fee status and pending installments", async () => {
    const suffix = randomId("fees");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Fee Tenant ${suffix}`,
        code: `FEE_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Fee Center ${suffix}`,
        code: `FEC_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Fee Level ${suffix}`,
        rank: 1,
        description: "Fee filter level"
      }
    });

    const centerEmail = `fee.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CFE_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const teacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `fee.teacher.${suffix}@example.com`,
      username: `TFE_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Fee Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: teacher.id
      }
    });

    const overdueStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `FOV_${suffix}`,
        firstName: "Overdue",
        lastName: "Student",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        currentTeacherUserId: teacher.id,
        totalFeeAmount: 1000,
        isActive: true
      }
    });

    const paidStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `FPD_${suffix}`,
        firstName: "Paid",
        lastName: "Student",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        currentTeacherUserId: teacher.id,
        totalFeeAmount: 1000,
        isActive: true
      }
    });

    await prisma.enrollment.createMany({
      data: [
        {
          tenantId: tenant.id,
          hierarchyNodeId: centerNode.id,
          studentId: overdueStudent.id,
          batchId: batch.id,
          assignedTeacherUserId: teacher.id,
          levelId: level.id,
          status: "ACTIVE"
        },
        {
          tenantId: tenant.id,
          hierarchyNodeId: centerNode.id,
          studentId: paidStudent.id,
          batchId: batch.id,
          assignedTeacherUserId: teacher.id,
          levelId: level.id,
          status: "ACTIVE"
        }
      ]
    });

    const overdueInstallment = await prisma.studentFeeInstallment.create({
      data: {
        tenantId: tenant.id,
        studentId: overdueStudent.id,
        amount: 600,
        dueDate: new Date("2026-04-05T00:00:00.000Z")
      }
    });

    const paidInstallment = await prisma.studentFeeInstallment.create({
      data: {
        tenantId: tenant.id,
        studentId: paidStudent.id,
        amount: 600,
        dueDate: new Date("2026-04-05T00:00:00.000Z")
      }
    });

    await prisma.financialTransaction.create({
      data: {
        tenantId: tenant.id,
        studentId: paidStudent.id,
        centerId: centerNode.id,
        type: "ENROLLMENT",
        paymentMode: "CASH",
        installmentId: paidInstallment.id,
        grossAmount: 600,
        centerShare: 600,
        franchiseShare: 0,
        bpShare: 0,
        platformShare: 0,
        createdByUserId: centerUser.id,
        receivedAt: new Date("2026-04-05T10:00:00.000Z")
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .get(`/api/enrollments?batchId=${encodeURIComponent(batch.id)}&feeStatus=OVERDUE&pendingInstallments=HAS_OVERDUE`)
      .set(authHeader(centerLogin.body?.data?.access_token));

    expect(res.statusCode).toBe(200);
    const items = Array.isArray(res.body?.data?.items) ? res.body.data.items : [];
    expect(items).toHaveLength(1);
    expect(items[0]?.student?.id).toBe(overdueStudent.id);
    expect(items[0]?.student?.feeStatus).toBe("OVERDUE");
    expect(items[0]?.student?.pendingInstallmentsCount).toBe(1);
    expect(items[0]?.student?.overdueInstallmentsCount).toBe(1);
    expect(Number(items[0]?.student?.pendingFeeAmount || 0)).toBe(600);
    expect(res.body?.data?.summary?.totalEnrollments).toBe(1);
    expect(res.body?.data?.summary?.matchedStudents).toBe(1);
    expect(res.body?.data?.summary?.overdueStudents).toBe(1);
    expect(res.body?.data?.summary?.pendingInstallments).toBe(1);
    expect(res.body?.data?.summary?.overdueInstallments).toBe(1);
    expect(Number(res.body?.data?.summary?.pendingFeeAmount || 0)).toBe(600);
  });

  test("bulk updates enrollment status within center scope", async () => {
    const suffix = randomId("bulk");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Bulk Tenant ${suffix}`,
        code: `BLK_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Center ${suffix}`,
        code: `BLC_${suffix}`,
        type: "BRANCH"
      }
    });

    const otherCenterNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Other Bulk Center ${suffix}`,
        code: `BLO_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Level ${suffix}`,
        rank: 1,
        description: "Bulk enrollment level"
      }
    });

    const centerEmail = `bulk.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CBL_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const teacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `bulk.teacher.${suffix}@example.com`,
      username: `TBL_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Bulk Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: teacher.id
      }
    });

    const otherBatch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: otherCenterNode.id,
        name: `Other Bulk Batch ${suffix}`,
        levelId: level.id
      }
    });

    const activeStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `BA_${suffix}`,
        firstName: "Bulk",
        lastName: "Active",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const inactiveStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `BI_${suffix}`,
        firstName: "Bulk",
        lastName: "Inactive",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const foreignStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `BF_${suffix}`,
        firstName: "Other",
        lastName: "Center",
        hierarchyNodeId: otherCenterNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const activeEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: activeStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const alreadyInactiveEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: inactiveStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: teacher.id,
        levelId: level.id,
        status: "INACTIVE"
      }
    });

    const foreignEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: otherCenterNode.id,
        studentId: foreignStudent.id,
        batchId: otherBatch.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .post("/api/enrollments/bulk-update")
      .set(authHeader(centerLogin.body?.data?.access_token))
      .send({
        enrollmentIds: [activeEnrollment.id, alreadyInactiveEnrollment.id, foreignEnrollment.id],
        status: "INACTIVE"
      });

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.updated).toBe(1);
    expect(res.body?.data?.skipped).toBe(1);
    expect(res.body?.data?.invalid).toBe(1);
    expect(res.body?.data?.updatedIds).toContain(activeEnrollment.id);
    expect(res.body?.data?.skippedIds).toContain(alreadyInactiveEnrollment.id);
    expect(res.body?.data?.invalidIds).toContain(foreignEnrollment.id);

    const refreshed = await prisma.enrollment.findUnique({ where: { id: activeEnrollment.id } });
    expect(refreshed?.status).toBe("INACTIVE");
  });

  test("bulk assigns teacher within center scope", async () => {
    const suffix = randomId("bulkteacher");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Bulk Teacher Tenant ${suffix}`,
        code: `BTT_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Teacher Center ${suffix}`,
        code: `BTC_${suffix}`,
        type: "BRANCH"
      }
    });

    const otherCenterNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Other Teacher Center ${suffix}`,
        code: `BTO_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Teacher Level ${suffix}`,
        rank: 1,
        description: "Bulk teacher assignment level"
      }
    });

    const centerEmail = `bulk.teacher.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CTA_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const currentTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `bulk.teacher.current.${suffix}@example.com`,
      username: `TCA_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const nextTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `bulk.teacher.next.${suffix}@example.com`,
      username: `TNA_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Bulk Teacher Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: currentTeacher.id
      }
    });

    const otherBatch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: otherCenterNode.id,
        name: `Other Bulk Teacher Batch ${suffix}`,
        levelId: level.id
      }
    });

    const firstStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `TA_${suffix}`,
        firstName: "Teacher",
        lastName: "Assign",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const secondStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `TS_${suffix}`,
        firstName: "Teacher",
        lastName: "Same",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const foreignStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `TF_${suffix}`,
        firstName: "Teacher",
        lastName: "Foreign",
        hierarchyNodeId: otherCenterNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const firstEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: firstStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: currentTeacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const secondEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: secondStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: nextTeacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const foreignEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: otherCenterNode.id,
        studentId: foreignStudent.id,
        batchId: otherBatch.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .post("/api/enrollments/bulk-update")
      .set(authHeader(centerLogin.body?.data?.access_token))
      .send({
        enrollmentIds: [firstEnrollment.id, secondEnrollment.id, foreignEnrollment.id],
        assignedTeacherUserId: nextTeacher.id
      });

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.updated).toBe(1);
    expect(res.body?.data?.skipped).toBe(1);
    expect(res.body?.data?.invalid).toBe(1);
    expect(res.body?.data?.updatedIds).toContain(firstEnrollment.id);
    expect(res.body?.data?.skippedIds).toContain(secondEnrollment.id);
    expect(res.body?.data?.invalidIds).toContain(foreignEnrollment.id);

    const refreshed = await prisma.enrollment.findUnique({ where: { id: firstEnrollment.id } });
    expect(refreshed?.assignedTeacherUserId).toBe(nextTeacher.id);
  });

  test("bulk updates teacher and status together within center scope", async () => {
    const suffix = randomId("bulkcombo");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Bulk Combo Tenant ${suffix}`,
        code: `BCTO_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Combo Center ${suffix}`,
        code: `BCO_${suffix}`,
        type: "BRANCH"
      }
    });

    const otherCenterNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Combo Other Center ${suffix}`,
        code: `BCX_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Combo Level ${suffix}`,
        rank: 1,
        description: "Bulk combined update level"
      }
    });

    const centerEmail = `bulk.combo.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CCO_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const currentTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `bulk.combo.current.${suffix}@example.com`,
      username: `TCO_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const nextTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `bulk.combo.next.${suffix}@example.com`,
      username: `TNO_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Bulk Combo Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: currentTeacher.id
      }
    });

    const otherBatch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: otherCenterNode.id,
        name: `Bulk Combo Other Batch ${suffix}`,
        levelId: level.id
      }
    });

    const firstStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `COA_${suffix}`,
        firstName: "Combo",
        lastName: "Apply",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const secondStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `COS_${suffix}`,
        firstName: "Combo",
        lastName: "Same",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const foreignStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `COF_${suffix}`,
        firstName: "Combo",
        lastName: "Foreign",
        hierarchyNodeId: otherCenterNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const firstEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: firstStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: currentTeacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const secondEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: secondStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: nextTeacher.id,
        levelId: level.id,
        status: "INACTIVE"
      }
    });

    const foreignEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: otherCenterNode.id,
        studentId: foreignStudent.id,
        batchId: otherBatch.id,
        assignedTeacherUserId: currentTeacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .post("/api/enrollments/bulk-update")
      .set(authHeader(centerLogin.body?.data?.access_token))
      .send({
        enrollmentIds: [firstEnrollment.id, secondEnrollment.id, foreignEnrollment.id],
        assignedTeacherUserId: nextTeacher.id,
        status: "INACTIVE"
      });

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.updated).toBe(1);
    expect(res.body?.data?.skipped).toBe(1);
    expect(res.body?.data?.invalid).toBe(1);
    expect(res.body?.data?.updatedIds).toContain(firstEnrollment.id);
    expect(res.body?.data?.skippedIds).toContain(secondEnrollment.id);
    expect(res.body?.data?.invalidIds).toContain(foreignEnrollment.id);

    const refreshed = await prisma.enrollment.findUnique({ where: { id: firstEnrollment.id } });
    expect(refreshed?.assignedTeacherUserId).toBe(nextTeacher.id);
    expect(refreshed?.status).toBe("INACTIVE");
  });

  test("bulk clears teacher assignments and skips already empty rows", async () => {
    const suffix = randomId("bulkclearteacher");

    const tenant = await prisma.tenant.create({
      data: {
        name: `Bulk Clear Teacher Tenant ${suffix}`,
        code: `BCT_${suffix}`
      }
    });

    const centerNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Clear Center ${suffix}`,
        code: `BCC_${suffix}`,
        type: "BRANCH"
      }
    });

    const level = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Bulk Clear Level ${suffix}`,
        rank: 1,
        description: "Bulk clear teacher level"
      }
    });

    const centerEmail = `bulk.teacher.clear.center.${suffix}@example.com`;
    const centerUser = await ensureAuthUser({
      tenantCode: tenant.code,
      email: centerEmail,
      username: `CTC_${suffix}`,
      role: "CENTER",
      hierarchyNodeCode: centerNode.code
    });

    const assignedTeacher = await ensureAuthUser({
      tenantCode: tenant.code,
      email: `bulk.teacher.clear.assigned.${suffix}@example.com`,
      username: `TCC_${suffix}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    const batch = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `Bulk Clear Batch ${suffix}`,
        levelId: level.id,
        primaryTeacherUserId: assignedTeacher.id
      }
    });

    const firstStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `CA_${suffix}`,
        firstName: "Clear",
        lastName: "Assigned",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const secondStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `CE_${suffix}`,
        firstName: "Clear",
        lastName: "Empty",
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true
      }
    });

    const assignedEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: firstStudent.id,
        batchId: batch.id,
        assignedTeacherUserId: assignedTeacher.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const emptyEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: secondStudent.id,
        batchId: batch.id,
        levelId: level.id,
        status: "ACTIVE"
      }
    });

    const centerLogin = await loginAs({ email: centerEmail, tenantCode: tenant.code });
    expect(centerLogin.statusCode).toBe(200);

    const res = await http
      .post("/api/enrollments/bulk-update")
      .set(authHeader(centerLogin.body?.data?.access_token))
      .send({
        enrollmentIds: [assignedEnrollment.id, emptyEnrollment.id],
        assignedTeacherUserId: ""
      });

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.updated).toBe(1);
    expect(res.body?.data?.skipped).toBe(1);
    expect(res.body?.data?.invalid).toBe(0);
    expect(res.body?.data?.updatedIds).toContain(assignedEnrollment.id);
    expect(res.body?.data?.skippedIds).toContain(emptyEnrollment.id);

    const refreshed = await prisma.enrollment.findUnique({ where: { id: assignedEnrollment.id } });
    expect(refreshed?.assignedTeacherUserId).toBeNull();
  });
});