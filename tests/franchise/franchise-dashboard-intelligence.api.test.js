import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

jest.setTimeout(120000);

async function createCenterForFranchise({ tenantId, franchiseId, hierarchyNodeId, suffix }) {
  const authUser = await prisma.authUser.create({
    data: {
      tenantId,
      username: `frdashce_${suffix}`,
      email: `frdashce.${suffix}@abacusweb.local`,
      passwordHash: "test-hash",
      role: "CENTER",
      hierarchyNodeId,
      isActive: true
    }
  });

  return prisma.centerProfile.create({
    data: {
      tenantId,
      franchiseProfileId: franchiseId,
      authUserId: authUser.id,
      code: `CE-${suffix}`,
      name: `Center ${suffix}`,
      displayName: `Center ${suffix}`,
      status: "ACTIVE",
      isActive: true
    },
    include: {
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });
}

describe("FRANCHISE DASHBOARD INTELLIGENCE API", () => {
  test("center-health stays franchise-scoped and snapshot-aware", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    const node = await prisma.hierarchyNode.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        isActive: true
      },
      orderBy: { createdAt: "asc" }
    });

    const franchiseUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `frdash.${randomId("owner")}@abacusweb.local`,
      username: randomId("frdashown"),
      role: "FRANCHISE",
      hierarchyNodeCode: node.code
    });

    const login = await loginAs({ email: franchiseUser.email });
    const token = login.body.data.access_token;

    const ownFranchise = await prisma.franchiseProfile.findUniqueOrThrow({
      where: {
        authUserId: franchiseUser.id
      }
    });

    const foreignUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `frdash.${randomId("foreign")}@abacusweb.local`,
      username: randomId("frdashfor"),
      role: "FRANCHISE",
      hierarchyNodeCode: node.code
    });

    const foreignFranchise = await prisma.franchiseProfile.findUniqueOrThrow({
      where: {
        authUserId: foreignUser.id
      }
    });

    const ownCenter = await createCenterForFranchise({
      tenantId: tenant.id,
      franchiseId: ownFranchise.id,
      hierarchyNodeId: node.id,
      suffix: randomId("owncenter")
    });
    const foreignCenter = await createCenterForFranchise({
      tenantId: tenant.id,
      franchiseId: foreignFranchise.id,
      hierarchyNodeId: node.id,
      suffix: randomId("foreigncenter")
    });

    const snapshotDate = new Date("2026-05-10T00:00:00.000Z");

    await prisma.centerAnalyticsSnapshot.createMany({
      data: [
        {
          tenantId: tenant.id,
          businessPartnerId: ownFranchise.businessPartnerId,
          franchiseId: ownFranchise.id,
          centerId: ownCenter.id,
          snapshotDate,
          activeStudents: 32,
          attendancePercent: 86,
          monthlyRevenue: 1200,
          pendingFees: 100,
          teacherCount: 2,
          studentGrowthPercent: 6,
          retentionPercent: 90,
          healthScore: 83
        },
        {
          tenantId: tenant.id,
          businessPartnerId: foreignFranchise.businessPartnerId,
          franchiseId: foreignFranchise.id,
          centerId: foreignCenter.id,
          snapshotDate,
          activeStudents: 9,
          attendancePercent: 41,
          monthlyRevenue: 200,
          pendingFees: 250,
          teacherCount: 0,
          studentGrowthPercent: -18,
          retentionPercent: 44,
          healthScore: 28
        }
      ],
      skipDuplicates: true
    });

    await prisma.franchiseAnalyticsSnapshot.createMany({
      data: [
        {
          tenantId: tenant.id,
          businessPartnerId: ownFranchise.businessPartnerId,
          franchiseId: ownFranchise.id,
          snapshotDate,
          studentCount: 32,
          activeStudents: 32,
          centerCount: 1,
          teacherCount: 2,
          monthlyCollections: 1200,
          pendingFees: 100,
          attendancePercent: 86,
          studentGrowthPercent: 6,
          healthScore: 83
        },
        {
          tenantId: tenant.id,
          businessPartnerId: foreignFranchise.businessPartnerId,
          franchiseId: foreignFranchise.id,
          snapshotDate,
          studentCount: 9,
          activeStudents: 9,
          centerCount: 1,
          teacherCount: 0,
          monthlyCollections: 200,
          pendingFees: 250,
          attendancePercent: 41,
          studentGrowthPercent: -18,
          healthScore: 28
        }
      ],
      skipDuplicates: true
    });

    const response = await http
      .get("/api/franchise/dashboard/center-health?limit=10&offset=0&sortBy=healthScore&sortDirection=desc")
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      centerId: ownCenter.id,
      centerCode: ownCenter.code,
      centerName: ownCenter.displayName,
      healthScore: 83
    });
    expect(response.body.data.items.some((item) => item.centerId === foreignCenter.id)).toBe(false);
    expect(response.body.data.meta.scope.franchiseId).toBe(ownFranchise.id);
    expect(response.body.data.meta.source.snapshotDate).toBe(snapshotDate.toISOString());
  });
});