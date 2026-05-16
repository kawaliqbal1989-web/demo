import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("CENTER CAPACITY GOVERNANCE", () => {
  let superadminToken;
  let centerToken;
  let bpToken;
  let tenantDefault;
  let tenantOther;
  let defaultCenter;
  let otherTenantCenter;
  let centerHierarchyNodeId;
  let importBatch;

  beforeAll(async () => {
    const [superadminLogin, centerLogin, bpLogin] = await Promise.all([
      loginAs({ email: "superadmin@abacusweb.local" }),
      loginAs({ email: "center.manager@abacusweb.local" }),
      loginAs({ email: "bp.manager@abacusweb.local" })
    ]);

    expect(superadminLogin.statusCode).toBe(200);
    expect(centerLogin.statusCode).toBe(200);
    expect(bpLogin.statusCode).toBe(200);

    superadminToken = superadminLogin.body.data.access_token;
    centerToken = centerLogin.body.data.access_token;
    bpToken = bpLogin.body.data.access_token;

    tenantDefault = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    tenantOther = await prisma.tenant.findUniqueOrThrow({ where: { code: "OTHER" } });

    defaultCenter = await prisma.centerProfile.findFirstOrThrow({
      where: {
        tenantId: tenantDefault.id,
        authUser: {
          is: {
            email: "center.manager@abacusweb.local"
          }
        }
      },
      include: {
        authUser: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    });

    const foreignCenterUser = await ensureAuthUser({
      tenantCode: "OTHER",
      email: `capacity.foreign.center.${Date.now()}@abacusweb.local`,
      role: "CENTER",
      hierarchyNodeCode: "SCH-001"
    });

    otherTenantCenter = await prisma.centerProfile.findUniqueOrThrow({
      where: {
        authUserId: foreignCenterUser.id
      }
    });

    centerHierarchyNodeId = defaultCenter.authUser?.hierarchyNodeId;

    importBatch = await prisma.batch.create({
      data: {
        tenantId: tenantDefault.id,
        hierarchyNodeId: centerHierarchyNodeId,
        name: randomId("CapBatch")
      }
    });
  });

  afterAll(async () => {
    if (importBatch?.id) {
      await prisma.enrollment.deleteMany({
        where: {
          tenantId: tenantDefault?.id,
          batchId: importBatch.id
        }
      });
      await prisma.batch.deleteMany({
        where: {
          tenantId: tenantDefault?.id,
          id: importBatch.id
        }
      });
    }
  });

  async function setCenterCapacity({ maxTeachers, maxStudents, allowOverAllocation = false }, token = superadminToken) {
    const response = await http
      .patch(`/api/bp/centers/${defaultCenter.id}/capacity`)
      .set(authHeader(token))
      .send({
        maxTeachers,
        maxStudents,
        allowOverAllocation
      });

    expect(response.statusCode).toBe(200);
    return response.body.data;
  }

  test("blocks teacher and student creation when limits are reached", async () => {
    const [currentTeacherCount, currentStudentCount] = await Promise.all([
      prisma.teacherProfile.count({
        where: {
          tenantId: tenantDefault.id,
          hierarchyNodeId: centerHierarchyNodeId,
          isActive: true,
          status: "ACTIVE"
        }
      }),
      prisma.student.count({
        where: {
          tenantId: tenantDefault.id,
          hierarchyNodeId: centerHierarchyNodeId,
          isActive: true
        }
      })
    ]);

    await setCenterCapacity({
      maxTeachers: currentTeacherCount,
      maxStudents: currentStudentCount,
      allowOverAllocation: false
    });

    const teacherCode = randomId("TC").slice(0, 10);
    const blockedTeacherResponse = await http
      .post("/api/teachers")
      .set(authHeader(centerToken))
      .send({
        teacherCode,
        fullName: "Blocked Teacher",
        status: "ACTIVE",
        createLoginAccount: true
      });

    expect(blockedTeacherResponse.statusCode).toBe(409);
    expect(blockedTeacherResponse.body.error_code).toBe("TEACHER_CAPACITY_EXCEEDED");

    const admissionNo = randomId("ST");
    const blockedStudentResponse = await http
      .post("/api/students")
      .set(authHeader(centerToken))
      .send({
        admissionNo,
        firstName: "Blocked",
        lastName: "Student",
        guardianName: "Guardian",
        guardianPhone: "9999999999",
        createLoginAccount: false
      });

    expect(blockedStudentResponse.statusCode).toBe(409);
    expect(blockedStudentResponse.body.error_code).toBe("STUDENT_CAPACITY_EXCEEDED");
  });

  test("serializes concurrent student creation so only one seat can be consumed", async () => {
    const currentStudentCount = await prisma.student.count({
      where: {
        tenantId: tenantDefault.id,
        hierarchyNodeId: centerHierarchyNodeId,
        isActive: true
      }
    });

    await setCenterCapacity({
      maxTeachers: 999,
      maxStudents: currentStudentCount + 1,
      allowOverAllocation: false
    });

    const payloads = [randomId("ST"), randomId("ST")].map((admissionNo, index) => ({
      admissionNo,
      firstName: `Concurrent${index + 1}`,
      lastName: "Seat",
      guardianName: "Guardian",
      guardianPhone: `90000000${index + 10}`,
      createLoginAccount: false
    }));

    const responses = await Promise.all(
      payloads.map((payload) => http.post("/api/students").set(authHeader(centerToken)).send(payload))
    );

    const successCount = responses.filter((response) => response.statusCode === 201).length;
    const blockedCount = responses.filter((response) => response.body?.error_code === "STUDENT_CAPACITY_EXCEEDED").length;

    expect(successCount).toBe(1);
    expect(blockedCount).toBe(1);
  });

  test("prevents BP access to foreign tenant centers and keeps summary tenant-scoped", async () => {
    const forbiddenResponse = await http
      .patch(`/api/bp/centers/${otherTenantCenter.id}/capacity`)
      .set(authHeader(bpToken))
      .send({
        maxTeachers: 25
      });

    expect(forbiddenResponse.statusCode).toBe(403);

    const summaryResponse = await http
      .get("/api/bp/centers/capacity-summary?limit=200&offset=0")
      .set(authHeader(bpToken));

    expect(summaryResponse.statusCode).toBe(200);
    const centerIds = summaryResponse.body.data.items.map((item) => item.centerId);
    expect(centerIds).toContain(defaultCenter.id);
    expect(centerIds).not.toContain(otherTenantCenter.id);
  });

  test("blocks overflow rows during bulk import and reports the failure", async () => {
    const currentStudentCount = await prisma.student.count({
      where: {
        tenantId: tenantDefault.id,
        hierarchyNodeId: centerHierarchyNodeId,
        isActive: true
      }
    });

    await setCenterCapacity({
      maxTeachers: 999,
      maxStudents: currentStudentCount + 1,
      allowOverAllocation: false
    });

    const csv = [
      "admissionNo,firstName,lastName,guardianName,guardianPhone,batchId",
      `${randomId("SB")},Bulk,Allowed,Guardian,9999999991,${importBatch.id}`,
      `${randomId("SB")},Bulk,Blocked,Guardian,9999999992,${importBatch.id}`
    ].join("\n");

    const response = await http
      .post("/api/students/import-csv")
      .set(authHeader(centerToken))
      .field("batchId", importBatch.id)
      .attach("file", Buffer.from(csv, "utf8"), {
        filename: "students.csv",
        contentType: "text/csv"
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.data.created).toBe(1);
    expect(response.body.data.errorCount).toBe(1);
    expect(response.body.data.errors[0].error).toContain("Student capacity exceeded");
  });

  test("writes capacity audits for updates and blocked attempts and exposes them to center view", async () => {
    const currentTeacherCount = await prisma.teacherProfile.count({
      where: {
        tenantId: tenantDefault.id,
        hierarchyNodeId: centerHierarchyNodeId,
        isActive: true,
        status: "ACTIVE"
      }
    });

    await setCenterCapacity({
      maxTeachers: currentTeacherCount,
      maxStudents: 999,
      allowOverAllocation: false
    });

    const teacherCode = randomId("TA").slice(0, 10);
    const blockedTeacherResponse = await http
      .post("/api/teachers")
      .set(authHeader(centerToken))
      .send({
        teacherCode,
        fullName: "Audit Blocked Teacher",
        status: "ACTIVE",
        createLoginAccount: true
      });

    expect(blockedTeacherResponse.statusCode).toBe(409);

    const auditRows = await prisma.auditLog.findMany({
      where: {
        tenantId: tenantDefault.id,
        entityType: "CENTER_CAPACITY",
        entityId: defaultCenter.id,
        action: {
          in: ["CENTER_CAPACITY_UPDATED", "CENTER_CAPACITY_LIMIT_BLOCKED"]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    });

    expect(auditRows.some((row) => row.action === "CENTER_CAPACITY_UPDATED")).toBe(true);
    expect(auditRows.some((row) => row.action === "CENTER_CAPACITY_LIMIT_BLOCKED")).toBe(true);

    const centerCapacityResponse = await http
      .get("/api/center/capacity")
      .set(authHeader(centerToken));

    expect(centerCapacityResponse.statusCode).toBe(200);
    expect(Array.isArray(centerCapacityResponse.body.data.auditHistory)).toBe(true);
    expect(centerCapacityResponse.body.data.auditHistory.some((row) => row.action === "CENTER_CAPACITY_UPDATED")).toBe(true);
    expect(centerCapacityResponse.body.data.auditHistory.some((row) => row.action === "CENTER_CAPACITY_LIMIT_BLOCKED")).toBe(true);
  });
});