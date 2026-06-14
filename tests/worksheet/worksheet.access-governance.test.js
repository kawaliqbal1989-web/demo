import {
  authHeader,
  ensureAuthUser,
  getTenantByCode,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("WORKSHEET ACCESS GOVERNANCE", () => {
  let tenant;
  let centerUser;
  let centerNode;
  let superadmin;
  let teacherLevel3;
  let teacherLevel5;
  let levelByRank;
  let testCourse;
  let batchL3;
  let batchL5;

  let wsL2;
  let wsL3;
  let wsL4;
  let wsL5;
  let wsL6;
  let studentL3Id;

  async function setCenterLicenseRank(rank) {
    await prisma.centerProfile.updateMany({
      where: {
        tenantId: tenant.id,
        authUserId: centerUser.id
      },
      data: {
        maxLicensedLevelRank: rank,
        licenseStartDate: null,
        licenseExpiryDate: null
      }
    });
  }

  beforeAll(async () => {
    tenant = await getTenantByCode("DEFAULT");

    centerUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        role: "CENTER",
        isActive: true
      },
      select: { id: true, hierarchyNodeId: true }
    });

    centerNode = await prisma.hierarchyNode.findUniqueOrThrow({
      where: { id: centerUser.hierarchyNodeId },
      select: { id: true, code: true }
    });

    superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, role: "SUPERADMIN", isActive: true },
      select: { id: true }
    });

    const neededRanks = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const rank of neededRanks) {
      // Keep this suite deterministic even if seed only includes lower levels.
      // eslint-disable-next-line no-await-in-loop
      await prisma.level.upsert({
        where: {
          tenantId_rank: {
            tenantId: tenant.id,
            rank
          }
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name: `Level ${rank}`,
          rank,
          description: `Auto-provisioned for governance test rank ${rank}`
        }
      });
    }

    const levels = await prisma.level.findMany({
      where: { tenantId: tenant.id, rank: { in: neededRanks } },
      select: { id: true, rank: true }
    });
    levelByRank = new Map(levels.map((row) => [row.rank, row]));

    teacherLevel3 = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `teacher.l3.${randomId("gov")}@abacusweb.local`,
      username: `TL3${Math.floor(Math.random() * 100000)}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    teacherLevel5 = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `teacher.l5.${randomId("gov")}@abacusweb.local`,
      username: `TL5${Math.floor(Math.random() * 100000)}`,
      role: "TEACHER",
      hierarchyNodeCode: centerNode.code,
      parentUserId: centerUser.id
    });

    batchL3 = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `BATCH-L3-${randomId("w")}`,
        levelId: levelByRank.get(3).id
      }
    });

    batchL5 = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `BATCH-L5-${randomId("w")}`,
        levelId: levelByRank.get(5).id
      }
    });

    await prisma.batchTeacherAssignment.create({
      data: {
        tenantId: tenant.id,
        batchId: batchL3.id,
        teacherUserId: teacherLevel3.id
      }
    });

    await prisma.batchTeacherAssignment.create({
      data: {
        tenantId: tenant.id,
        batchId: batchL5.id,
        teacherUserId: teacherLevel5.id
      }
    });

    const studentL3 = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-L3-${randomId("w")}`,
        firstName: "Gov",
        lastName: "L3",
        hierarchyNodeId: centerNode.id,
        levelId: levelByRank.get(3).id,
        isActive: true
      }
    });
    studentL3Id = studentL3.id;

    const studentL5 = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `ST-L5-${randomId("w")}`,
        firstName: "Gov",
        lastName: "L5",
        hierarchyNodeId: centerNode.id,
        levelId: levelByRank.get(5).id,
        isActive: true
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: studentL3.id,
        batchId: batchL3.id,
        assignedTeacherUserId: teacherLevel3.id,
        levelId: levelByRank.get(3).id,
        status: "ACTIVE"
      }
    });

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        studentId: studentL5.id,
        batchId: batchL5.id,
        assignedTeacherUserId: teacherLevel5.id,
        levelId: levelByRank.get(5).id,
        status: "ACTIVE"
      }
    });

    const marker = `GOV-${randomId("marker")}`;

    wsL2 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `${marker}-L2`,
        description: marker,
        levelId: levelByRank.get(2).id,
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    wsL3 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `${marker}-L3`,
        description: marker,
        levelId: levelByRank.get(3).id,
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    wsL4 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `${marker}-L4`,
        description: marker,
        levelId: levelByRank.get(4).id,
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    wsL5 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `${marker}-L5`,
        description: marker,
        levelId: levelByRank.get(5).id,
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    wsL6 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `${marker}-L6`,
        description: marker,
        levelId: levelByRank.get(6).id,
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    testCourse = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        code: `TC-${randomId("c")}`,
        name: `Governance Course ${randomId("n")}`,
        isActive: true
      }
    });

    await prisma.courseLevel.createMany({
      data: [1, 2, 3, 4, 5, 6].map((rank) => ({
        tenantId: tenant.id,
        courseId: testCourse.id,
        levelNumber: rank,
        title: `Level ${rank}`,
        sortOrder: rank,
        isActive: true
      }))
    });
  });

  test("Teacher Level 3 sees levels <=3 and is denied level 4+ direct API", async () => {
    await setCenterLicenseRank(3);

    const login = await loginAs({ email: teacherLevel3.email });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const listRes = await http.get("/api/worksheets").query({ q: "GOV-" }).set(authHeader(token));
    expect(listRes.status).toBe(200);

    const worksheetIds = (listRes.body?.data || []).map((row) => row.id);
    expect(worksheetIds).toContain(wsL2.id);
    expect(worksheetIds).toContain(wsL3.id);
    expect(worksheetIds).not.toContain(wsL4.id);
    expect(worksheetIds).not.toContain(wsL5.id);
    expect(worksheetIds).not.toContain(wsL6.id);

    const level4Query = await http
      .get("/api/worksheets")
      .query({ levelId: levelByRank.get(4).id })
      .set(authHeader(token));
    expect(level4Query.status).toBe(403);
    expect(level4Query.body?.error_code).toBe("LEVEL_SCOPE_DENIED");

    const directWorksheet = await http.get(`/api/worksheets/${wsL4.id}`).set(authHeader(token));
    expect(directWorksheet.status).toBe(403);
    expect(directWorksheet.body?.error_code).toBe("LEVEL_SCOPE_DENIED");

    const catalogLevels = await http
      .get(`/api/catalog/courses/${testCourse.id}/levels`)
      .set(authHeader(token));
    expect(catalogLevels.status).toBe(200);
    const visible = (catalogLevels.body?.data?.items || [])
      .map((row) => row.levelNumber)
      .sort((a, b) => a - b);
    expect(visible).toEqual([1, 2, 3]);
  });

  test("Teacher Level 5 sees levels <=5 and is denied level 6+ direct API", async () => {
    await setCenterLicenseRank(5);

    const login = await loginAs({ email: teacherLevel5.email });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const listRes = await http.get("/api/worksheets").query({ q: "GOV-" }).set(authHeader(token));
    expect(listRes.status).toBe(200);

    const worksheetIds = (listRes.body?.data || []).map((row) => row.id);
    expect(worksheetIds).toContain(wsL2.id);
    expect(worksheetIds).toContain(wsL3.id);
    expect(worksheetIds).toContain(wsL4.id);
    expect(worksheetIds).toContain(wsL5.id);
    expect(worksheetIds).not.toContain(wsL6.id);

    const level6Query = await http
      .get("/api/worksheets")
      .query({ levelId: levelByRank.get(6).id })
      .set(authHeader(token));
    expect(level6Query.status).toBe(403);
    expect(level6Query.body?.error_code).toBe("LEVEL_SCOPE_DENIED");

    const directWorksheet = await http.get(`/api/worksheets/${wsL6.id}`).set(authHeader(token));
    expect(directWorksheet.status).toBe(403);
    expect(directWorksheet.body?.error_code).toBe("LEVEL_SCOPE_DENIED");
  });

  test("Teacher cannot assign worksheet above level cap in batch workspace", async () => {
    await setCenterLicenseRank(3);

    const login = await loginAs({ email: teacherLevel3.email });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const assignRes = await http
      .post(`/api/teacher/batches/${batchL3.id}/worksheets/assign`)
      .set(authHeader(token))
      .send({
        worksheetId: wsL4.id,
        dueDate: "2026-07-01"
      });

    expect(assignRes.status).toBe(403);
    expect(assignRes.body?.error_code).toBe("LEVEL_SCOPE_DENIED");
  });

  test("Teacher cannot assign worksheet to a batch they are not assigned to", async () => {
    const login = await loginAs({ email: teacherLevel3.email });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const assignRes = await http
      .post(`/api/teacher/batches/${batchL5.id}/worksheets/assign`)
      .set(authHeader(token))
      .send({
        worksheetId: wsL3.id,
        dueDate: "2026-07-01"
      });

    expect(assignRes.status).toBe(403);
    expect(assignRes.body?.error_code).toBe("TEACHER_BATCH_FORBIDDEN");
  });

  test("Legacy teacher worksheet assignment routes are disabled", async () => {
    const login = await loginAs({ email: teacherLevel3.email });
    expect(login.status).toBe(200);
    const token = login.body?.data?.access_token;

    const legacyGet = await http
      .get(`/api/teacher/students/${studentL3Id}/assign-worksheets`)
      .set(authHeader(token));
    expect(legacyGet.status).toBe(410);
    expect(legacyGet.body?.error_code).toBe("LEGACY_ASSIGNMENT_ROUTE_DISABLED");

    const legacyPost = await http
      .post(`/api/teacher/students/${studentL3Id}/assign-worksheets`)
      .set(authHeader(token))
      .send({ worksheetIds: [wsL3.id] });
    expect(legacyPost.status).toBe(410);
    expect(legacyPost.body?.error_code).toBe("LEGACY_ASSIGNMENT_ROUTE_DISABLED");

    const legacyBulk = await http
      .post("/api/teacher/worksheets/bulk-assign")
      .set(authHeader(token))
      .send({ worksheetId: wsL3.id, studentIds: [studentL3Id], dueDate: "2026-07-01" });
    expect(legacyBulk.status).toBe(410);
    expect(legacyBulk.body?.error_code).toBe("LEGACY_ASSIGNMENT_ROUTE_DISABLED");
  }, 15000);
});
