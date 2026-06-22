import { loginAs, authHeader, http, prisma } from "../tests/helpers/test-helpers.js";

async function run() {
  const login = await loginAs({ username: "CE001" });
  const token = login?.body?.data?.access_token;

  if (!token) {
    console.log(JSON.stringify({
      error: "CENTER_LOGIN_FAILED",
      loginStatus: login?.status,
      body: login?.body
    }, null, 2));
    return;
  }

  const centerUser = await prisma.authUser.findFirst({
    where: {
      username: "CE001"
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      hierarchyNodeId: true,
      centerProfile: {
        select: {
          id: true,
          franchiseProfileId: true
        }
      }
    }
  });

  const studentsRes = await http
    .get("/api/students?limit=500&offset=0")
    .set(authHeader(token));

  const rows = Array.isArray(studentsRes?.body?.data) ? studentsRes.body.data : [];
  const out = [];

  for (const s of rows) {
    const sid = s?.id;
    if (!sid) continue;

    const currentLevelId = s?.effectiveLevelId || s?.levelId || s?.effectiveLevel?.id || s?.level?.id || null;
    const assignedLevelId = s?.levelId || s?.level?.id || null;
    const activeEnrollment = (s?.batchEnrollments || [])[0] || null;

    const promo = await http
      .get(`/api/students/${sid}/promotion-status`)
      .set(authHeader(token));

    const assign = await http
      .patch(`/api/students/${sid}/assign-level`)
      .set(authHeader(token))
      .send({ levelId: currentLevelId });

    const db = await prisma.student.findUnique({
      where: { id: sid },
      select: {
        id: true,
        tenantId: true,
        hierarchyNodeId: true,
        levelId: true,
        isActive: true,
        temporaryExamCycleId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        tenantId: db?.tenantId,
        studentId: sid,
        status: "ACTIVE"
      },
      select: {
        id: true,
        batchId: true,
        levelId: true,
        hierarchyNodeId: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const historyCount = await prisma.studentLevelProgressionHistory.count({
      where: {
        studentId: sid,
        ...(db?.tenantId ? { tenantId: db.tenantId } : {})
      }
    });

    out.push({
      studentId: sid,
      admissionNo: s?.admissionNo || null,
      currentLevelId,
      assignedLevelId,
      promotionStatusHttp: promo.status,
      promotionStatusBody: promo.body,
      assignLevelHttp: assign.status,
      assignLevelBody: assign.body,
      activeEnrollmentId: activeEnrollment?.id || null,
      activeBatchId: activeEnrollment?.batchId || activeEnrollment?.batch?.id || null,
      activeEnrollmentLevelId: activeEnrollment?.levelId || activeEnrollment?.level?.id || null,
      centerOwnershipNodeId: s?.hierarchyNodeId || null,
      centerUserNodeId: centerUser?.hierarchyNodeId || null,
      centerUserId: centerUser?.id || null,
      centerFranchiseProfileId: centerUser?.centerProfile?.franchiseProfileId || null,
      db,
      activeEnrollments,
      historyCount
    });
  }

  const failing = out.filter((x) => x.promotionStatusHttp !== 200 || x.assignLevelHttp !== 200);
  const working = out.filter((x) => x.promotionStatusHttp === 200 && x.assignLevelHttp === 200);

  console.log(JSON.stringify({
    total: out.length,
    failingCount: failing.length,
    failingIds: failing.map((f) => f.studentId),
    samplesFailing: failing.slice(0, 20),
    samplesWorking: working.slice(0, 20)
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(JSON.stringify({ error: error?.message || String(error), stack: error?.stack }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
