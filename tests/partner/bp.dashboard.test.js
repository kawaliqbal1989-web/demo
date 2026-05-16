import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { clearBpDashboardCache } from "../../src/services/bp-dashboard.service.js";
import {
  getFranchiseAlertsAnalytics,
  getFranchiseOverviewAnalytics,
  getFranchiseRevenueTrendAnalytics,
  getFranchiseStudentGrowthAnalytics
} from "../../src/services/bp-analytics.service.js";
import { resolveBusinessPartnerScope } from "../../src/services/bp-scope.service.js";

describe("BP DASHBOARD ANALYTICS", () => {
  let bpToken;
  let tenantDefault;
  let tenantOther;
  let bpUser;
  let bpPartner;
  let franchiseOne;
  let franchiseTwo;
  let centerOne;
  let centerTwo;
  let otherPartner;
  let otherFranchise;
  let otherCenter;
  let defaultSchoolNode;
  let centerNodeTwo;
  let currentSnapshotDate;
  let previousSnapshotDate;
  let createdStudentIds = [];
  let createdTransactionIds = [];
  let createdUsers = [];

  beforeAll(async () => {
    const bpLogin = await loginAs({ email: "bp.manager@abacusweb.local" });
    bpToken = bpLogin.body.data.access_token;

    tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    tenantOther = await prisma.tenant.findUniqueOrThrow({ where: { code: "OTHER" } });

    bpUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenantDefault.id,
        email: "bp.manager@abacusweb.local",
        role: "BP"
      }
    });

    bpPartner = await prisma.businessPartner.findFirstOrThrow({
      where: {
        tenantId: tenantDefault.id,
        contactEmail: String(bpUser.email || "").toLowerCase()
      },
      orderBy: { createdAt: "desc" }
    });

    const franchiseProfiles = await prisma.franchiseProfile.findMany({
      where: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        status: { not: "ARCHIVED" }
      },
      orderBy: { createdAt: "asc" },
      include: {
        authUser: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    });

    franchiseOne = franchiseProfiles[0];

    const centerProfiles = await prisma.centerProfile.findMany({
      where: {
        tenantId: tenantDefault.id,
        franchiseProfile: {
          is: {
            businessPartnerId: bpPartner.id
          }
        },
        status: { not: "ARCHIVED" }
      },
      orderBy: { createdAt: "asc" },
      include: {
        authUser: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    });

    centerOne = centerProfiles[0];

    defaultSchoolNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenantDefault.id,
          code: "SCH-001"
        }
      }
    });

    const [franchiseNodeOne, centerNodeOne] = await Promise.all([
      franchiseOne?.authUser?.hierarchyNodeId
        ? prisma.hierarchyNode.findUnique({
            where: {
              id: franchiseOne.authUser.hierarchyNodeId
            }
          })
        : null,
      centerOne?.authUser?.hierarchyNodeId
        ? prisma.hierarchyNode.findUnique({
            where: {
              id: centerOne.authUser.hierarchyNodeId
            }
          })
        : null
    ]);

    const centerNodes = centerNodeOne
      ? await prisma.hierarchyNode.findMany({
          where: {
            tenantId: tenantDefault.id,
            type: centerNodeOne.type
          },
          orderBy: { createdAt: "asc" }
        })
      : [];

    centerNodeTwo = centerNodes.find((node) => node.id !== centerOne?.authUser?.hierarchyNodeId) || centerNodeOne;

    if (!franchiseProfiles[1]) {
      const franchiseNode = franchiseNodeOne
        ? await prisma.hierarchyNode.findFirst({
            where: {
              tenantId: tenantDefault.id,
              type: franchiseNodeOne.type,
              id: {
                not: franchiseOne?.authUser?.hierarchyNodeId || undefined
              }
            },
            orderBy: { createdAt: "asc" }
          })
        : null;

      const franchiseUser = await ensureAuthUser({
        tenantCode: "DEFAULT",
        email: `${randomId("bpdash-fr")}@abacusweb.local`,
        username: randomId("bpdashfr"),
        role: "FRANCHISE",
        hierarchyNodeCode: franchiseNode?.code || franchiseNodeOne?.code,
        parentUserId: bpUser.id
      });
      createdUsers.push(franchiseUser.id);

      franchiseTwo = await prisma.franchiseProfile.upsert({
        where: { authUserId: franchiseUser.id },
        update: {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          code: `FR-${randomId("bp2")}`,
          name: "Ranking Franchise B",
          displayName: "Ranking Franchise B",
          status: "ACTIVE",
          isActive: true
        },
        create: {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          authUserId: franchiseUser.id,
          code: `FR-${randomId("bp2")}`,
          name: "Ranking Franchise B",
          displayName: "Ranking Franchise B",
          status: "ACTIVE",
          isActive: true
        }
      });
    } else {
      franchiseTwo = franchiseProfiles[1];
    }

    if (!centerProfiles[1]) {
      const centerUser = await ensureAuthUser({
        tenantCode: "DEFAULT",
        email: `${randomId("bpdash-ce")}@abacusweb.local`,
        username: randomId("bpdashce"),
        role: "CENTER",
        hierarchyNodeCode: centerNodeTwo?.code || centerNodeOne?.code,
        parentUserId: bpUser.id
      });
      createdUsers.push(centerUser.id);

      centerTwo = await prisma.centerProfile.upsert({
        where: { authUserId: centerUser.id },
        update: {
          tenantId: tenantDefault.id,
          franchiseProfileId: franchiseTwo.id,
          code: `CE-${randomId("bp2")}`,
          name: "Health Center B",
          displayName: "Health Center B",
          status: "ACTIVE",
          isActive: true
        },
        create: {
          tenantId: tenantDefault.id,
          franchiseProfileId: franchiseTwo.id,
          authUserId: centerUser.id,
          code: `CE-${randomId("bp2")}`,
          name: "Health Center B",
          displayName: "Health Center B",
          status: "ACTIVE",
          isActive: true
        }
      });
    } else {
      centerTwo = centerProfiles[1];
    }

    otherPartner = await prisma.businessPartner.findFirstOrThrow({
      where: {
        tenantId: tenantOther.id,
        isActive: true,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "asc" }
    });

    otherFranchise = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId: tenantOther.id,
        businessPartnerId: otherPartner.id
      },
      orderBy: { createdAt: "asc" }
    });

    if (!otherFranchise) {
      const otherFranchiseNode = await prisma.hierarchyNode.findFirstOrThrow({
        where: {
          tenantId: tenantOther.id
        },
        orderBy: { createdAt: "asc" }
      });

      const otherFranchiseUser = await ensureAuthUser({
        tenantCode: "OTHER",
        email: `${randomId("other-fr")}@abacusweb.local`,
        username: randomId("otherfr"),
        role: "FRANCHISE",
        hierarchyNodeCode: otherFranchiseNode.code
      });
      createdUsers.push(otherFranchiseUser.id);

      otherFranchise = await prisma.franchiseProfile.upsert({
        where: { authUserId: otherFranchiseUser.id },
        update: {
          tenantId: tenantOther.id,
          businessPartnerId: otherPartner.id,
          code: `OT-FR-${randomId("bp")}`,
          name: "Other Franchise",
          displayName: "Other Franchise",
          status: "ACTIVE",
          isActive: true
        },
        create: {
          tenantId: tenantOther.id,
          businessPartnerId: otherPartner.id,
          authUserId: otherFranchiseUser.id,
          code: `OT-FR-${randomId("bp")}`,
          name: "Other Franchise",
          displayName: "Other Franchise",
          status: "ACTIVE",
          isActive: true
        }
      });
    }

    otherCenter = await prisma.centerProfile.findFirst({
      where: {
        tenantId: tenantOther.id,
        franchiseProfileId: otherFranchise.id
      },
      orderBy: { createdAt: "asc" }
    });

    if (!otherCenter) {
      const otherCenterNode = await prisma.hierarchyNode.findFirstOrThrow({
        where: {
          tenantId: tenantOther.id
        },
        orderBy: { createdAt: "desc" }
      });

      const otherCenterUser = await ensureAuthUser({
        tenantCode: "OTHER",
        email: `${randomId("other-ce")}@abacusweb.local`,
        username: randomId("otherce"),
        role: "CENTER",
        hierarchyNodeCode: otherCenterNode.code
      });
      createdUsers.push(otherCenterUser.id);

      otherCenter = await prisma.centerProfile.upsert({
        where: { authUserId: otherCenterUser.id },
        update: {
          tenantId: tenantOther.id,
          franchiseProfileId: otherFranchise.id,
          code: `OT-CE-${randomId("bp")}`,
          name: "Other Center",
          displayName: "Other Center",
          status: "ACTIVE",
          isActive: true
        },
        create: {
          tenantId: tenantOther.id,
          franchiseProfileId: otherFranchise.id,
          authUserId: otherCenterUser.id,
          code: `OT-CE-${randomId("bp")}`,
          name: "Other Center",
          displayName: "Other Center",
          status: "ACTIVE",
          isActive: true
        }
      });
    }

    const now = new Date();
    currentSnapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 0, 0, 0, 0));
    previousSnapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 0, 0, 0, 0));

    await prisma.analyticsDailySnapshot.upsert({
      where: {
        businessPartnerId_snapshotDate: {
          businessPartnerId: bpPartner.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantDefault.id,
        totalStudents: 120,
        activeStudents: 92,
        totalFranchises: 2,
        activeCenters: 2,
        monthlyCollections: 3250,
        pendingFees: 475,
        newAdmissions: 14,
        attendancePercent: 88.5,
        studentGrowthPercent: 9.2,
        healthScore: 84.1
      },
      create: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        snapshotDate: currentSnapshotDate,
        totalStudents: 120,
        activeStudents: 92,
        totalFranchises: 2,
        activeCenters: 2,
        monthlyCollections: 3250,
        pendingFees: 475,
        newAdmissions: 14,
        attendancePercent: 88.5,
        studentGrowthPercent: 9.2,
        healthScore: 84.1
      }
    });

    await prisma.analyticsDailySnapshot.upsert({
      where: {
        businessPartnerId_snapshotDate: {
          businessPartnerId: bpPartner.id,
          snapshotDate: previousSnapshotDate
        }
      },
      update: {
        tenantId: tenantDefault.id,
        totalStudents: 103,
        activeStudents: 81,
        totalFranchises: 2,
        activeCenters: 2,
        monthlyCollections: 2875,
        pendingFees: 510,
        newAdmissions: 9,
        attendancePercent: 84.25,
        studentGrowthPercent: 5.1,
        healthScore: 78.5
      },
      create: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        snapshotDate: previousSnapshotDate,
        totalStudents: 103,
        activeStudents: 81,
        totalFranchises: 2,
        activeCenters: 2,
        monthlyCollections: 2875,
        pendingFees: 510,
        newAdmissions: 9,
        attendancePercent: 84.25,
        studentGrowthPercent: 5.1,
        healthScore: 78.5
      }
    });

    await prisma.analyticsDailySnapshot.upsert({
      where: {
        businessPartnerId_snapshotDate: {
          businessPartnerId: otherPartner.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantOther.id,
        totalStudents: 999,
        activeStudents: 999,
        totalFranchises: 1,
        activeCenters: 1,
        monthlyCollections: 9999,
        pendingFees: 0,
        newAdmissions: 0,
        attendancePercent: 99,
        studentGrowthPercent: 99,
        healthScore: 99
      },
      create: {
        tenantId: tenantOther.id,
        businessPartnerId: otherPartner.id,
        snapshotDate: currentSnapshotDate,
        totalStudents: 999,
        activeStudents: 999,
        totalFranchises: 1,
        activeCenters: 1,
        monthlyCollections: 9999,
        pendingFees: 0,
        newAdmissions: 0,
        attendancePercent: 99,
        studentGrowthPercent: 99,
        healthScore: 99
      }
    });

    await prisma.franchiseAnalyticsSnapshot.upsert({
      where: {
        franchiseId_snapshotDate: {
          franchiseId: franchiseOne.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        studentCount: 66,
        activeStudents: 54,
        centerCount: 1,
        teacherCount: 4,
        monthlyCollections: 1900,
        pendingFees: 250,
        attendancePercent: 90,
        studentGrowthPercent: 11,
        healthScore: 87.4
      },
      create: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseOne.id,
        snapshotDate: currentSnapshotDate,
        studentCount: 66,
        activeStudents: 54,
        centerCount: 1,
        teacherCount: 4,
        monthlyCollections: 1900,
        pendingFees: 250,
        attendancePercent: 90,
        studentGrowthPercent: 11,
        healthScore: 87.4
      }
    });

    await prisma.franchiseAnalyticsSnapshot.upsert({
      where: {
        franchiseId_snapshotDate: {
          franchiseId: franchiseTwo.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        studentCount: 54,
        activeStudents: 38,
        centerCount: 1,
        teacherCount: 3,
        monthlyCollections: 1350,
        pendingFees: 225,
        attendancePercent: 82,
        studentGrowthPercent: 6,
        healthScore: 73.5
      },
      create: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseTwo.id,
        snapshotDate: currentSnapshotDate,
        studentCount: 54,
        activeStudents: 38,
        centerCount: 1,
        teacherCount: 3,
        monthlyCollections: 1350,
        pendingFees: 225,
        attendancePercent: 82,
        studentGrowthPercent: 6,
        healthScore: 73.5
      }
    });

    await prisma.franchiseAnalyticsSnapshot.upsert({
      where: {
        franchiseId_snapshotDate: {
          franchiseId: otherFranchise.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantOther.id,
        businessPartnerId: otherPartner.id,
        studentCount: 400,
        activeStudents: 350,
        centerCount: 1,
        teacherCount: 10,
        monthlyCollections: 9000,
        pendingFees: 0,
        attendancePercent: 95,
        studentGrowthPercent: 25,
        healthScore: 96
      },
      create: {
        tenantId: tenantOther.id,
        businessPartnerId: otherPartner.id,
        franchiseId: otherFranchise.id,
        snapshotDate: currentSnapshotDate,
        studentCount: 400,
        activeStudents: 350,
        centerCount: 1,
        teacherCount: 10,
        monthlyCollections: 9000,
        pendingFees: 0,
        attendancePercent: 95,
        studentGrowthPercent: 25,
        healthScore: 96
      }
    });

    await prisma.centerAnalyticsSnapshot.upsert({
      where: {
        centerId_snapshotDate: {
          centerId: centerOne.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseOne.id,
        activeStudents: 54,
        attendancePercent: 91,
        monthlyRevenue: 1900,
        pendingFees: 250,
        teacherCount: 4,
        studentGrowthPercent: 11,
        retentionPercent: 90,
        healthScore: 88.2
      },
      create: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseOne.id,
        centerId: centerOne.id,
        snapshotDate: currentSnapshotDate,
        activeStudents: 54,
        attendancePercent: 91,
        monthlyRevenue: 1900,
        pendingFees: 250,
        teacherCount: 4,
        studentGrowthPercent: 11,
        retentionPercent: 90,
        healthScore: 88.2
      }
    });

    await prisma.centerAnalyticsSnapshot.upsert({
      where: {
        centerId_snapshotDate: {
          centerId: centerTwo.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseTwo.id,
        activeStudents: 38,
        attendancePercent: 79,
        monthlyRevenue: 1350,
        pendingFees: 225,
        teacherCount: 3,
        studentGrowthPercent: 6,
        retentionPercent: 78,
        healthScore: 72.3
      },
      create: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseTwo.id,
        centerId: centerTwo.id,
        snapshotDate: currentSnapshotDate,
        activeStudents: 38,
        attendancePercent: 79,
        monthlyRevenue: 1350,
        pendingFees: 225,
        teacherCount: 3,
        studentGrowthPercent: 6,
        retentionPercent: 78,
        healthScore: 72.3
      }
    });

    await prisma.centerAnalyticsSnapshot.upsert({
      where: {
        centerId_snapshotDate: {
          centerId: otherCenter.id,
          snapshotDate: currentSnapshotDate
        }
      },
      update: {
        tenantId: tenantOther.id,
        businessPartnerId: otherPartner.id,
        franchiseId: otherFranchise.id,
        activeStudents: 300,
        attendancePercent: 99,
        monthlyRevenue: 8000,
        pendingFees: 10,
        teacherCount: 8,
        studentGrowthPercent: 30,
        retentionPercent: 98,
        healthScore: 97
      },
      create: {
        tenantId: tenantOther.id,
        businessPartnerId: otherPartner.id,
        franchiseId: otherFranchise.id,
        centerId: otherCenter.id,
        snapshotDate: currentSnapshotDate,
        activeStudents: 300,
        attendancePercent: 99,
        monthlyRevenue: 8000,
        pendingFees: 10,
        teacherCount: 8,
        studentGrowthPercent: 30,
        retentionPercent: 98,
        healthScore: 97
      }
    });

    const liveStudent = await prisma.student.create({
      data: {
        tenantId: tenantDefault.id,
        admissionNo: `ADM-${randomId("bpdash")}`,
        firstName: "Dashboard",
        lastName: "Fallback",
        email: null,
        hierarchyNodeId: centerOne.authUser?.hierarchyNodeId || defaultSchoolNode.id,
        levelId: (await prisma.level.findFirstOrThrow({ where: { tenantId: tenantDefault.id, rank: 1 } })).id,
        isActive: true,
        createdAt: currentSnapshotDate
      }
    });
    createdStudentIds.push(liveStudent.id);

    const fallbackTransactions = await prisma.$transaction([
      prisma.financialTransaction.create({
        data: {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          studentId: liveStudent.id,
          centerId: centerOne.authUser?.hierarchyNodeId || defaultSchoolNode.id,
          franchiseId: null,
          type: "ENROLLMENT",
          grossAmount: 250,
          centerShare: 0,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 250,
          createdByUserId: bpUser.id,
          createdAt: previousSnapshotDate
        }
      }),
      prisma.financialTransaction.create({
        data: {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          studentId: liveStudent.id,
          centerId: centerOne.authUser?.hierarchyNodeId || defaultSchoolNode.id,
          franchiseId: null,
          type: "ENROLLMENT",
          grossAmount: 400,
          centerShare: 0,
          franchiseShare: 0,
          bpShare: 0,
          platformShare: 400,
          createdByUserId: bpUser.id,
          createdAt: currentSnapshotDate
        }
      })
    ]);
    createdTransactionIds.push(...fallbackTransactions.map((row) => row.id));
  });

  beforeEach(() => {
    clearBpDashboardCache();
  });

  afterAll(async () => {
    clearBpDashboardCache();
    if (createdTransactionIds.length) {
      await prisma.financialTransaction.deleteMany({
        where: {
          id: {
            in: createdTransactionIds
          }
        }
      });
    }

    if (createdStudentIds.length) {
      await prisma.student.deleteMany({
        where: {
          id: {
            in: createdStudentIds
          }
        }
      });
    }

    if (createdUsers.length) {
      await prisma.centerProfile.deleteMany({
        where: {
          authUserId: {
            in: createdUsers
          }
        }
      });
      await prisma.franchiseProfile.deleteMany({
        where: {
          authUserId: {
            in: createdUsers
          }
        }
      });
      await prisma.authUser.deleteMany({
        where: {
          id: {
            in: createdUsers
          }
        }
      });
    }
  });

  test("overview uses current month snapshot and dashboard cache", async () => {
    const firstResponse = await http
      .get("/api/partner/dashboard/overview")
      .set(authHeader(bpToken));

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data.meta.source.mode).toBe("snapshot");
    expect(firstResponse.body.data.meta.cache.hit).toBe(false);
    expect(firstResponse.body.data.kpis.totalStudents.value).toBe(120);
    expect(firstResponse.body.data.kpis.totalStudents.previousValue).toBe(103);
    expect(firstResponse.body.data.kpis.monthlyCollections.value).toBe(3250);

    const secondResponse = await http
      .get("/api/partner/dashboard/overview")
      .set(authHeader(bpToken));

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data.meta.cache.hit).toBe(true);
    expect(secondResponse.body.data.kpis.healthScore.value).toBe(84.1);
  });

  test("student growth trend returns snapshot-first monthly series", async () => {
    const response = await http
      .get("/api/partner/dashboard/student-growth-trend?months=2")
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.meta.source.mode).toBe("snapshot");
    expect(response.body.data.series).toHaveLength(2);
    expect(response.body.data.series[1].activeStudents).toBe(92);
    expect(response.body.data.series[1].newAdmissions).toBe(14);
  });

  test("franchise ranking is sorted by snapshot metrics and excludes other tenant rows", async () => {
    const response = await http
      .get("/api/partner/dashboard/franchise-ranking?sortBy=monthlyCollections&sortDirection=desc&limit=5")
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.meta.source.mode).toBe("snapshot");
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.items[0].monthlyCollections).toBe(1900);
    expect(response.body.data.items[1].monthlyCollections).toBe(1350);
    expect(response.body.data.items.some((item) => item.franchiseId === otherFranchise.id)).toBe(false);
  });

  test("center health supports scoped snapshot sorting and pagination", async () => {
    const response = await http
      .get("/api/partner/dashboard/center-health?sortBy=healthScore&sortDirection=asc&limit=1&offset=0")
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.meta.source.mode).toBe("snapshot");
    expect(response.body.data.pagination.total).toBe(2);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].healthScore).toBe(72.3);
    expect(response.body.data.items[0].centerId).toBe(centerTwo.id);
  });

  test("centers list aligns with dashboard scope and preserves pagination", async () => {
    const [overviewResponse, centerHealthResponse, centersResponse, nextPageResponse] = await Promise.all([
      http.get("/api/partner/dashboard/overview").set(authHeader(bpToken)),
      http.get("/api/partner/dashboard/center-health?limit=10&offset=0").set(authHeader(bpToken)),
      http.get("/api/centers?limit=10&offset=0").set(authHeader(bpToken)),
      http.get("/api/centers?limit=1&offset=1").set(authHeader(bpToken))
    ]);

    expect(overviewResponse.status).toBe(200);
    expect(centerHealthResponse.status).toBe(200);
    expect(centersResponse.status).toBe(200);
    expect(nextPageResponse.status).toBe(200);

    const centerHealthIds = centerHealthResponse.body.data.items.map((item) => item.centerId).sort();
    const listedCenterIds = centersResponse.body.data.items.map((item) => item.id).sort();

    expect(overviewResponse.body.data.kpis.activeCenters.value).toBe(2);
    expect(centersResponse.body.data.total).toBe(overviewResponse.body.data.kpis.activeCenters.value);
    expect(listedCenterIds).toEqual(centerHealthIds);
    expect(listedCenterIds).toEqual(expect.arrayContaining([centerOne.id, centerTwo.id]));
    expect(listedCenterIds).not.toContain(otherCenter.id);
    expect(nextPageResponse.body.data.total).toBe(2);
    expect(nextPageResponse.body.data.items).toHaveLength(1);
    expect(listedCenterIds).toContain(nextPageResponse.body.data.items[0].id);
  });

  test("revenue trend falls back to live aggregation when snapshots are absent", async () => {
    await prisma.analyticsDailySnapshot.deleteMany({
      where: {
        tenantId: tenantDefault.id,
        businessPartnerId: bpPartner.id
      }
    });
    clearBpDashboardCache();

    const response = await http
      .get("/api/partner/dashboard/revenue-trend?months=2")
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.meta.source.mode).toBe("live");
    expect(response.body.data.series).toHaveLength(2);
    expect(response.body.data.series[0].revenue).toBeGreaterThanOrEqual(250);
    expect(response.body.data.series[1].revenue).toBeGreaterThanOrEqual(400);
  });

  test("franchise detail endpoints return scoped snapshot-backed analytics and centers pagination", async () => {
    clearBpDashboardCache();

    const asOf = currentSnapshotDate.toISOString();
    const [overviewResponse, revenueResponse, growthResponse, centersResponse, nextCentersPageResponse] = await Promise.all([
      http.get(`/api/partner/franchises/${franchiseOne.id}/overview?asOf=${encodeURIComponent(asOf)}`).set(authHeader(bpToken)),
      http.get(`/api/partner/franchises/${franchiseOne.id}/revenue-trend?asOf=${encodeURIComponent(asOf)}&months=1`).set(authHeader(bpToken)),
      http.get(`/api/partner/franchises/${franchiseOne.id}/student-growth?asOf=${encodeURIComponent(asOf)}&months=1`).set(authHeader(bpToken)),
      http
        .get(`/api/partner/franchises/${franchiseOne.id}/centers?asOf=${encodeURIComponent(asOf)}&sortBy=healthScore&sortDirection=asc&limit=1&offset=0`)
        .set(authHeader(bpToken)),
      http
        .get(`/api/partner/franchises/${franchiseOne.id}/centers?asOf=${encodeURIComponent(asOf)}&sortBy=healthScore&sortDirection=asc&limit=1&offset=1`)
        .set(authHeader(bpToken))
    ]);

    expect(overviewResponse.status).toBe(200);
    expect(revenueResponse.status).toBe(200);
    expect(growthResponse.status).toBe(200);
    expect(centersResponse.status).toBe(200);
    expect(nextCentersPageResponse.status).toBe(200);

    expect(overviewResponse.body.data.meta.source.mode).toBe("snapshot");
    expect(overviewResponse.body.data.kpis.totalStudents.value).toBe(66);
    expect(overviewResponse.body.data.kpis.activeCenters.value).toBe(1);
    expect(overviewResponse.body.data.kpis.teacherCount.value).toBe(4);

    expect(revenueResponse.body.data.meta.source.mode).toBe("snapshot");
    expect(revenueResponse.body.data.series).toHaveLength(1);
    expect(revenueResponse.body.data.summary.totalRevenue).toBe(1900);

    expect(growthResponse.body.data.meta.source.mode).toBe("snapshot");
    expect(growthResponse.body.data.series).toHaveLength(1);
    expect(growthResponse.body.data.series[0].activeStudents).toBe(54);
    expect(typeof growthResponse.body.data.series[0].newAdmissions).toBe("number");

    expect(centersResponse.body.data.meta.source.mode).toBe("snapshot");
    expect(centersResponse.body.data.sort).toEqual({
      sortBy: "healthScore",
      sortDirection: "asc"
    });
    expect(centersResponse.body.data.pagination.total).toBe(1);
    expect(centersResponse.body.data.pagination.returned).toBe(1);
    expect(centersResponse.body.data.items).toHaveLength(1);
    expect(centersResponse.body.data.items[0].centerId).toBe(centerOne.id);
    expect(centersResponse.body.data.items[0].franchiseId).toBe(franchiseOne.id);
    expect(nextCentersPageResponse.body.data.pagination.total).toBe(1);
    expect(nextCentersPageResponse.body.data.items).toHaveLength(0);
  });

  test("franchise alerts endpoint derives scoped operational issues", async () => {
    await prisma.centerAnalyticsSnapshot.update({
      where: {
        centerId_snapshotDate: {
          centerId: centerTwo.id,
          snapshotDate: currentSnapshotDate
        }
      },
      data: {
        attendancePercent: 52,
        studentGrowthPercent: -18,
        healthScore: 39,
        monthlyRevenue: 300,
        pendingFees: 700
      }
    });
    clearBpDashboardCache();

    const response = await http
      .get(`/api/partner/franchises/${franchiseTwo.id}/alerts?asOf=${encodeURIComponent(currentSnapshotDate.toISOString())}`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.meta.source.mode).toBe("snapshot");
    expect(response.body.data.summary.totalAlerts).toBeGreaterThanOrEqual(3);
    expect(response.body.data.summary.criticalCount).toBeGreaterThanOrEqual(1);
    expect(response.body.data.items.every((item) => item.centerId === centerTwo.id)).toBe(true);
    expect(response.body.data.items.some((item) => item.type === "LOW_ATTENDANCE")).toBe(true);
    expect(response.body.data.items.some((item) => item.type === "UNHEALTHY_CENTER")).toBe(true);
    expect(response.body.data.items.some((item) => item.type === "DECLINING_GROWTH")).toBe(true);
  });

  test("franchise revenue trend endpoint falls back to live aggregation when snapshots are absent", async () => {
    await prisma.franchiseAnalyticsSnapshot.deleteMany({
      where: {
        tenantId: tenantDefault.id,
        franchiseId: franchiseOne.id,
        snapshotDate: currentSnapshotDate
      }
    });
    clearBpDashboardCache();

    try {
      const response = await http
        .get(`/api/partner/franchises/${franchiseOne.id}/revenue-trend?months=2`)
        .set(authHeader(bpToken));

      expect(response.status).toBe(200);
      expect(response.body.data.meta.source.mode).toBe("live");
      expect(response.body.data.series).toHaveLength(2);
      expect(response.body.data.series[0].revenue).toBeGreaterThanOrEqual(250);
      expect(response.body.data.series[1].revenue).toBeGreaterThanOrEqual(400);
    } finally {
      await prisma.franchiseAnalyticsSnapshot.upsert({
        where: {
          franchiseId_snapshotDate: {
            franchiseId: franchiseOne.id,
            snapshotDate: currentSnapshotDate
          }
        },
        update: {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          studentCount: 66,
          activeStudents: 54,
          centerCount: 1,
          teacherCount: 4,
          monthlyCollections: 1900,
          pendingFees: 250,
          attendancePercent: 90,
          studentGrowthPercent: 11,
          healthScore: 87.4
        },
        create: {
          tenantId: tenantDefault.id,
          businessPartnerId: bpPartner.id,
          franchiseId: franchiseOne.id,
          snapshotDate: currentSnapshotDate,
          studentCount: 66,
          activeStudents: 54,
          centerCount: 1,
          teacherCount: 4,
          monthlyCollections: 1900,
          pendingFees: 250,
          attendancePercent: 90,
          studentGrowthPercent: 11,
          healthScore: 87.4
        }
      });
      clearBpDashboardCache();
    }
  });

  test("franchise detail endpoints mask foreign franchise access", async () => {
    clearBpDashboardCache();

    const response = await http
      .get(`/api/partner/franchises/${otherFranchise.id}/overview`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(404);
    expect(response.body.error_code).toBe("FRANCHISE_NOT_FOUND");
  });

  test("franchise detail loaders return snapshot-backed overview, revenue, and student growth for a scoped franchise", async () => {
    const bpScope = await resolveBusinessPartnerScope({
      tenantId: tenantDefault.id,
      businessPartnerId: bpPartner.id
    });

    const [overview, revenueTrend, studentGrowth] = await Promise.all([
      getFranchiseOverviewAnalytics({
        tenantId: tenantDefault.id,
        bpScope,
        franchiseId: franchiseOne.id,
        asOf: currentSnapshotDate
      }),
      getFranchiseRevenueTrendAnalytics({
        tenantId: tenantDefault.id,
        bpScope,
        franchiseId: franchiseOne.id,
        months: 1,
        asOf: currentSnapshotDate
      }),
      getFranchiseStudentGrowthAnalytics({
        tenantId: tenantDefault.id,
        bpScope,
        franchiseId: franchiseOne.id,
        months: 1,
        asOf: currentSnapshotDate
      })
    ]);

    expect(overview.meta.source.mode).toBe("snapshot");
    expect(overview.kpis.totalStudents.value).toBe(66);
    expect(overview.kpis.activeStudents.value).toBe(54);
    expect(overview.kpis.totalCenters.value).toBe(1);
    expect(overview.kpis.activeCenters.value).toBe(1);
    expect(overview.kpis.totalRevenue.value).toBe(1900);
    expect(overview.kpis.pendingFees.value).toBe(250);
    expect(overview.kpis.teacherCount.value).toBe(4);

    expect(revenueTrend.meta.source.mode).toBe("snapshot");
    expect(revenueTrend.series).toHaveLength(1);
    expect(revenueTrend.series[0].revenue).toBe(1900);
    expect(revenueTrend.summary.totalRevenue).toBe(1900);

    expect(studentGrowth.meta.source.mode).toBe("snapshot");
    expect(studentGrowth.series).toHaveLength(1);
    expect(studentGrowth.series[0].activeStudents).toBe(54);
    expect(typeof studentGrowth.series[0].newAdmissions).toBe("number");
  });

  test("franchise alerts derive scoped operational issues from center metrics", async () => {
    await prisma.centerAnalyticsSnapshot.update({
      where: {
        centerId_snapshotDate: {
          centerId: centerTwo.id,
          snapshotDate: currentSnapshotDate
        }
      },
      data: {
        attendancePercent: 52,
        studentGrowthPercent: -18,
        healthScore: 39,
        monthlyRevenue: 300,
        pendingFees: 700
      }
    });
    clearBpDashboardCache();

    const bpScope = await resolveBusinessPartnerScope({
      tenantId: tenantDefault.id,
      businessPartnerId: bpPartner.id,
      forceRefresh: true
    });

    const alerts = await getFranchiseAlertsAnalytics({
      tenantId: tenantDefault.id,
      bpScope,
      franchiseId: franchiseTwo.id,
      asOf: currentSnapshotDate
    });

    expect(alerts.meta.source.mode).toBe("snapshot");
    expect(alerts.summary.totalAlerts).toBeGreaterThanOrEqual(3);
    expect(alerts.summary.criticalCount).toBeGreaterThanOrEqual(1);
    expect(alerts.items.every((item) => item.centerId === centerTwo.id)).toBe(true);
    expect(alerts.items.some((item) => item.type === "LOW_ATTENDANCE")).toBe(true);
    expect(alerts.items.some((item) => item.type === "UNHEALTHY_CENTER")).toBe(true);
    expect(alerts.items.some((item) => item.type === "DECLINING_GROWTH")).toBe(true);
  });
});