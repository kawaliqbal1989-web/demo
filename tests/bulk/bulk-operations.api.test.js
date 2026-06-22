import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

async function getCenterContext() {
  const center = await prisma.authUser.findFirstOrThrow({
    where: { username: "CE001" },
    select: { id: true, tenantId: true, hierarchyNodeId: true }
  });

  const [level1, level2] = await prisma.level.findMany({
    where: { tenantId: center.tenantId, rank: { in: [1, 2] } },
    orderBy: { rank: "asc" }
  });

  const teacher = await prisma.authUser.findFirstOrThrow({
    where: {
      tenantId: center.tenantId,
      role: "TEACHER",
      hierarchyNodeId: center.hierarchyNodeId,
      isActive: true
    },
    select: { id: true }
  });

  return { center, level1, level2, teacher };
}

async function createStudentWithEnrollment({ tenantId, hierarchyNodeId, levelId, batchId, suffix }) {
  const student = await prisma.student.create({
    data: {
      tenantId,
      hierarchyNodeId,
      levelId,
      admissionNo: `BULK-${suffix}`,
      firstName: `Bulk${suffix}`,
      lastName: "Student",
      email: `bulk.${suffix}@example.com`
    }
  });

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId,
      hierarchyNodeId,
      studentId: student.id,
      batchId,
      levelId,
      status: "ACTIVE"
    }
  });

  return { student, enrollment };
}

describe("BULK OPERATIONS API", () => {
  let token;
  let ctx;
  let sourceBatch;

  beforeAll(async () => {
    const login = await loginAs({ username: "CE001" });
    token = login.body.data.access_token;

    ctx = await getCenterContext();

    sourceBatch = await prisma.batch.create({
      data: {
        tenantId: ctx.center.tenantId,
        hierarchyNodeId: ctx.center.hierarchyNodeId,
        name: `Bulk Source ${randomId("batch")}`,
        isActive: true,
        status: "ACTIVE"
      }
    });
  });

  test("Bulk Promote syncs student and active enrollment level", async () => {
    const suffix = randomId("promote");
    const { student } = await createStudentWithEnrollment({
      tenantId: ctx.center.tenantId,
      hierarchyNodeId: ctx.center.hierarchyNodeId,
      levelId: ctx.level1.id,
      batchId: sourceBatch.id,
      suffix
    });

    const response = await http
      .post("/api/bulk/promote")
      .set(authHeader(token))
      .send({ studentIds: [student.id], newLevelId: ctx.level2.id });

    expect(response.status).toBe(200);
    expect(response.body.promoted).toBe(1);

    const refreshed = await prisma.student.findUniqueOrThrow({
      where: { id: student.id },
      select: {
        levelId: true,
        batchEnrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { levelId: true }
        }
      }
    });

    expect(refreshed.levelId).toBe(ctx.level2.id);
    expect(refreshed.batchEnrollments[0]?.levelId).toBe(ctx.level2.id);
  });

  test("Bulk Deactivate deactivates active enrollments", async () => {
    const suffix = randomId("deactivate");
    const { student } = await createStudentWithEnrollment({
      tenantId: ctx.center.tenantId,
      hierarchyNodeId: ctx.center.hierarchyNodeId,
      levelId: ctx.level1.id,
      batchId: sourceBatch.id,
      suffix
    });

    const response = await http
      .post("/api/bulk/status")
      .set(authHeader(token))
      .send({ studentIds: [student.id], isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(1);

    const [refreshedStudent, activeEnrollments] = await Promise.all([
      prisma.student.findUniqueOrThrow({ where: { id: student.id }, select: { isActive: true } }),
      prisma.enrollment.count({ where: { studentId: student.id, status: "ACTIVE" } })
    ]);

    expect(refreshedStudent.isActive).toBe(false);
    expect(activeEnrollments).toBe(0);
  });

  test("Bulk Transfer rejects inactive/archived target batch", async () => {
    const suffix = randomId("transfer");
    const { student } = await createStudentWithEnrollment({
      tenantId: ctx.center.tenantId,
      hierarchyNodeId: ctx.center.hierarchyNodeId,
      levelId: ctx.level1.id,
      batchId: sourceBatch.id,
      suffix
    });

    const inactiveBatch = await prisma.batch.create({
      data: {
        tenantId: ctx.center.tenantId,
        hierarchyNodeId: ctx.center.hierarchyNodeId,
        name: `Bulk Inactive ${randomId("batch")}`,
        isActive: false,
        status: "ARCHIVED",
        archivedAt: new Date()
      }
    });

    const response = await http
      .post("/api/bulk/transfer")
      .set(authHeader(token))
      .send({ studentIds: [student.id], targetBatchId: inactiveBatch.id, targetTeacherUserId: ctx.teacher.id });

    expect(response.status).toBe(404);
    expect(response.body.error_code).toBe("TARGET_BATCH_NOT_FOUND");
  });

  test("Bulk Assign Teacher validates teacher and scope", async () => {
    const suffix = randomId("teacher");
    const { student } = await createStudentWithEnrollment({
      tenantId: ctx.center.tenantId,
      hierarchyNodeId: ctx.center.hierarchyNodeId,
      levelId: ctx.level1.id,
      batchId: sourceBatch.id,
      suffix
    });

    const response = await http
      .post("/api/bulk/assign-teacher")
      .set(authHeader(token))
      .send({ studentIds: [student.id], teacherUserId: "non_existing_teacher" });

    expect(response.status).toBe(404);
    expect(response.body.error_code).toBe("TEACHER_NOT_FOUND");
  });

  test("Bulk Fee Update rejects invalid values", async () => {
    const suffix = randomId("fees");
    const { student } = await createStudentWithEnrollment({
      tenantId: ctx.center.tenantId,
      hierarchyNodeId: ctx.center.hierarchyNodeId,
      levelId: ctx.level1.id,
      batchId: sourceBatch.id,
      suffix
    });

    const response = await http
      .post("/api/bulk/fees")
      .set(authHeader(token))
      .send({ studentIds: [student.id], totalFeeAmount: -100 });

    expect(response.status).toBe(400);
    expect(response.body.error_code).toBe("INVALID_FEE_VALUE");
  });
});
