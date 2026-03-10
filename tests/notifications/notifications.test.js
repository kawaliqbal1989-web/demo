import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId,
  waitFor
} from "../helpers/test-helpers.js";

async function createPromotionEligibleStudent({ tenantId, hierarchyNodeId, levelId, createdByUserId }) {
  const suffix = randomId("notif");
  const student = await prisma.student.create({
    data: {
      tenantId,
      admissionNo: `NT-${suffix}`,
      firstName: "Notify",
      lastName: suffix,
      email: `notify.${suffix}@example.com`,
      hierarchyNodeId,
      levelId
    }
  });

  for (let index = 0; index < 3; index += 1) {
    const worksheet = await prisma.worksheet.create({
      data: {
        tenantId,
        title: `Notif worksheet ${suffix}-${index}`,
        levelId,
        difficulty: "EASY",
        createdByUserId,
        isPublished: true
      }
    });

    await prisma.worksheetSubmission.create({
      data: {
        tenantId,
        worksheetId: worksheet.id,
        studentId: student.id,
        score: 90,
        status: "REVIEWED",
        submittedAt: new Date(Date.now() - 5000 + index * 1000),
        correctCount: 18,
        totalQuestions: 20,
        completionTimeSeconds: 30
      }
    });
  }

  const competition = await prisma.competition.create({
    data: {
      tenantId,
      title: `Notif exam ${suffix}`,
      status: "SCHEDULED",
      workflowStage: "APPROVED",
      startsAt: new Date(Date.now() - 3600 * 1000),
      endsAt: new Date(Date.now() + 3600 * 1000),
      hierarchyNodeId,
      levelId,
      createdByUserId
    }
  });

  await prisma.competitionEnrollment.create({
    data: {
      competitionId: competition.id,
      studentId: student.id,
      tenantId,
      totalScore: 90
    }
  });

  return student;
}

describe("NOTIFICATIONS", () => {
  let centerToken;
  let superadminToken;
  let teacherToken;
  let tenant;
  let school;
  let level1;
  let superadminUser;
  let teacherUser;

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    centerToken = centerLogin.body.data.access_token;

    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });

    superadminUser = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "superadmin@abacusweb.local" }
    });

    teacherUser = await ensureAuthUser({
      email: "teacher.notify@abacusweb.local",
      role: "TEACHER",
      hierarchyNodeCode: "SCH-001"
    });

    const teacherLogin = await loginAs({ email: "teacher.notify@abacusweb.local" });
    teacherToken = teacherLogin.body.data.access_token;
  });

  test("Notification created after promotion", async () => {
    const student = await createPromotionEligibleStudent({
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      levelId: level1.id,
      createdByUserId: superadminUser.id
    });

    const response = await http
      .post(`/api/students/${student.id}/confirm-promotion`)
      .set(authHeader(centerToken));

    expect(response.status).toBe(200);

    const createdNotification = await waitFor(
      async () =>
        prisma.notification.findFirst({
          where: {
            tenantId: tenant.id,
            recipientUserId: teacherUser.id,
            type: "PROMOTION_CONFIRMED",
            entityId: student.id
          },
          orderBy: { createdAt: "desc" }
        }),
      { timeoutMs: 4000, intervalMs: 150 }
    );

    expect(createdNotification).toBeTruthy();
    expect(createdNotification.isRead).toBe(false);
  });

  test("markAsRead updates state", async () => {
    const notification = await prisma.notification.create({
      data: {
        tenantId: tenant.id,
        recipientUserId: superadminUser.id,
        type: "SYSTEM_BROADCAST",
        title: "Read me",
        message: "mark as read test"
      }
    });

    const response = await http
      .patch(`/api/notifications/${notification.id}/read`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body.data.isRead).toBe(true);

    const updated = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(updated.isRead).toBe(true);
  });

  test("markAllAsRead works", async () => {
    await prisma.notification.createMany({
      data: [
        {
          tenantId: tenant.id,
          recipientUserId: teacherUser.id,
          type: "SYSTEM_BROADCAST",
          title: "bulk-1",
          message: "bulk-1"
        },
        {
          tenantId: tenant.id,
          recipientUserId: teacherUser.id,
          type: "SYSTEM_BROADCAST",
          title: "bulk-2",
          message: "bulk-2"
        }
      ]
    });

    const response = await http
      .patch("/api/notifications/mark-all-read")
      .set(authHeader(teacherToken));

    expect(response.status).toBe(200);
    expect(response.body.data.updatedCount).toBeGreaterThanOrEqual(2);

    const unread = await prisma.notification.count({
      where: {
        tenantId: tenant.id,
        recipientUserId: teacherUser.id,
        isRead: false
      }
    });

    expect(unread).toBe(0);
  });
});
