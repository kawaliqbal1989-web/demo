import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { invalidateBusinessPartnerScopeCache, resolveBusinessPartnerScope } from "../../src/services/bp-scope.service.js";

describe("BP CERTIFICATE MODULE HARDENING", () => {
  let bpToken;
  let tenant;
  let bpUser;
  let bpPartner;
  let scope;
  let level1;
  let level2;
  let primaryNodeId;
  let secondaryNodeId;
  let primaryCenterId;

  const createdStudentIds = [];
  const createdCompletionIds = [];
  const createdCertificateIds = [];
  const createdCourseIds = [];

  const prefix = randomId("bp_cert");

  async function createStudents({ count, hierarchyNodeId, levelId, startAt = 0, courseId = null }) {
    const rows = Array.from({ length: count }).map((_, index) => ({
      tenantId: tenant.id,
      admissionNo: `${prefix}_ADM_${String(startAt + index).padStart(4, "0")}`,
      firstName: "BP",
      lastName: `Student${startAt + index}`,
      email: null,
      hierarchyNodeId,
      levelId,
      courseId
    }));

    await prisma.student.createMany({
      data: rows,
      skipDuplicates: true
    });

    const students = await prisma.student.findMany({
      where: {
        tenantId: tenant.id,
        admissionNo: {
          in: rows.map((row) => row.admissionNo)
        }
      },
      select: {
        id: true,
        admissionNo: true
      }
    });

    createdStudentIds.push(...students.map((row) => row.id));
    return students;
  }

  beforeAll(async () => {
    const login = await loginAs({ email: "bp.manager@abacusweb.local" });
    bpToken = login.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    bpUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        role: "BP",
        email: "bp.manager@abacusweb.local"
      }
    });

    bpPartner = await prisma.businessPartner.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        contactEmail: String(bpUser.email || "").toLowerCase()
      },
      orderBy: { createdAt: "desc" }
    });

    scope = await resolveBusinessPartnerScope({
      tenantId: tenant.id,
      businessPartnerId: bpPartner.id,
      forceRefresh: true
    });

    const scopeNodes = (scope?.hierarchyNodeIds || []).filter((id) => typeof id === "string" && id.length);
    if (!scopeNodes.length) {
      throw new Error("BP scope does not include any hierarchy nodes");
    }

    primaryNodeId = scopeNodes[0];
    secondaryNodeId = scopeNodes[1] || scopeNodes[0];
    primaryCenterId = scope?.centerIds?.[0] || null;

    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
    level2 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 2 } });
  });

  afterAll(async () => {
    if (createdCertificateIds.length) {
      await prisma.certificate.deleteMany({ where: { id: { in: createdCertificateIds } } });
    }

    if (createdCompletionIds.length) {
      await prisma.studentLevelCompletion.deleteMany({ where: { id: { in: createdCompletionIds } } });
    }

    if (createdStudentIds.length) {
      await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    }

    if (createdCourseIds.length) {
      await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
    }
  });

  test("supports student pagination beyond 100 records", async () => {
    await createStudents({ count: 350, hierarchyNodeId: primaryNodeId, levelId: level1.id, startAt: 0 });

    const page1 = await http
      .get("/api/partner/students?page=1&pageSize=200")
      .set(authHeader(bpToken));

    expect(page1.status).toBe(200);
    expect(page1.body.data.page).toBe(1);
    expect(page1.body.data.pageSize).toBe(200);
    expect(page1.body.data.items.length).toBe(200);
    expect(page1.body.data.total).toBeGreaterThanOrEqual(350);

    const page2 = await http
      .get("/api/partner/students?page=2&pageSize=200")
      .set(authHeader(bpToken));

    expect(page2.status).toBe(200);
    expect(page2.body.data.page).toBe(2);
    expect(page2.body.data.items.length).toBeGreaterThanOrEqual(150);
  });

  test("shows students across multiple scoped hierarchy nodes", async () => {
    const a = await createStudents({ count: 1, hierarchyNodeId: primaryNodeId, levelId: level1.id, startAt: 5000 });
    const b = await createStudents({ count: 1, hierarchyNodeId: secondaryNodeId, levelId: level1.id, startAt: 6000 });

    const response = await http
      .get(`/api/partner/students?page=1&pageSize=300&q=${prefix}_ADM_`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);

    const admissions = new Set(response.body.data.items.map((row) => row.admissionNo));
    expect(admissions.has(a[0].admissionNo)).toBe(true);
    expect(admissions.has(b[0].admissionNo)).toBe(true);
  });

  test("franchise center students are visible to BP", async () => {
    expect(primaryCenterId).toBeTruthy();

    const center = await prisma.centerProfile.findUnique({
      where: { id: primaryCenterId },
      select: { authUser: { select: { hierarchyNodeId: true } } }
    });

    const franchiseCenterNodeId = center?.authUser?.hierarchyNodeId;
    expect(franchiseCenterNodeId).toBeTruthy();

    const [student] = await createStudents({
      count: 1,
      hierarchyNodeId: franchiseCenterNodeId,
      levelId: level1.id,
      startAt: 6100
    });

    const response = await http
      .get(`/api/partner/students?page=1&pageSize=200&q=${student.admissionNo}`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.items.some((row) => row.id === student.id)).toBe(true);
  });

  test("direct center students are visible to BP via explicit center scope", async () => {
    const nodePrefix = randomId("bpdirect");

    const externalBpRoot = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        code: `EXT-BP-${nodePrefix}`,
        name: "External BP Root",
        type: "REGION",
        parentId: null
      }
    });

    const externalFrNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        code: `EXT-FR-${nodePrefix}`,
        name: "External Franchise Node",
        type: "DISTRICT",
        parentId: externalBpRoot.id
      }
    });

    const externalCenterNode = await prisma.hierarchyNode.create({
      data: {
        tenantId: tenant.id,
        code: `EXT-CE-${nodePrefix}`,
        name: "External Center Node",
        type: "SCHOOL",
        parentId: externalFrNode.id
      }
    });

    const externalBp = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `External Partner ${nodePrefix}`,
        code: `EXTBP-${nodePrefix}`,
        displayName: `External Partner ${nodePrefix}`,
        status: "ACTIVE",
        isActive: true,
        hierarchyNodeId: externalBpRoot.id,
        createdByUserId: bpUser.id
      }
    });

    const franchiseUser = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `XFR_${nodePrefix}`,
        email: `${nodePrefix}.fr@abacusweb.local`,
        passwordHash: bpUser.passwordHash,
        role: "FRANCHISE",
        isActive: true,
        hierarchyNodeId: externalFrNode.id
      }
    });

    const centerUser = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `XCE_${nodePrefix}`,
        email: `${nodePrefix}.ce@abacusweb.local`,
        passwordHash: bpUser.passwordHash,
        role: "CENTER",
        isActive: true,
        hierarchyNodeId: externalCenterNode.id
      }
    });

    const externalFranchise = await prisma.franchiseProfile.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: externalBp.id,
        authUserId: franchiseUser.id,
        code: `EXT-FR-${nodePrefix}`,
        name: "External Franchise",
        displayName: "External Franchise",
        status: "ACTIVE",
        isActive: true
      }
    });

    const externalCenter = await prisma.centerProfile.create({
      data: {
        tenantId: tenant.id,
        franchiseProfileId: externalFranchise.id,
        authUserId: centerUser.id,
        code: `EXT-CE-${nodePrefix}`,
        name: "Direct Scope Center",
        displayName: "Direct Scope Center",
        status: "ACTIVE",
        isActive: true
      }
    });

    await prisma.businessPartnerCenterScope.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        centerId: externalCenter.id,
        scopeType: "DIRECT",
        status: "ACTIVE"
      }
    });

    invalidateBusinessPartnerScopeCache({
      tenantId: tenant.id,
      businessPartnerId: bpPartner.id,
      userId: bpUser.id
    });

    const [student] = await createStudents({
      count: 1,
      hierarchyNodeId: externalCenterNode.id,
      levelId: level1.id,
      startAt: 6200
    });

    const response = await http
      .get(`/api/partner/students?page=1&pageSize=200&q=${student.admissionNo}`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.items.some((row) => row.id === student.id)).toBe(true);
  });

  test("enforces student enrollment-level consistency during issue", async () => {
    const [student] = await createStudents({
      count: 1,
      hierarchyNodeId: primaryNodeId,
      levelId: level1.id,
      startAt: 7000
    });

    const mismatch = await http
      .post("/api/partner/certificates")
      .set(authHeader(bpToken))
      .send({ studentId: student.id, levelId: level2.id });

    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error_code).toBe("CERTIFICATE_LEVEL_MISMATCH");
  });

  test("persists historical course and level snapshots", async () => {
    const courseA = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        code: `CRS-${randomId("A")}`,
        name: "Abacus Snapshot A"
      }
    });
    createdCourseIds.push(courseA.id);

    const courseB = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        code: `CRS-${randomId("B")}`,
        name: "Abacus Snapshot B"
      }
    });
    createdCourseIds.push(courseB.id);

    const [student] = await createStudents({
      count: 1,
      hierarchyNodeId: primaryNodeId,
      levelId: level1.id,
      startAt: 8000,
      courseId: courseA.id
    });

    const issued = await http
      .post("/api/partner/certificates")
      .set(authHeader(bpToken))
      .send({ studentId: student.id, levelId: level1.id });

    expect(issued.status).toBe(201);
    createdCertificateIds.push(issued.body.data.id);

    await prisma.student.update({
      where: { id: student.id },
      data: {
        courseId: courseB.id,
        levelId: level2.id
      }
    });

    const listed = await http
      .get(`/api/partner/certificates?page=1&pageSize=50&q=${student.admissionNo}`)
      .set(authHeader(bpToken));

    expect(listed.status).toBe(200);
    const cert = listed.body.data.items.find((row) => row.student?.id === student.id);

    expect(cert).toBeTruthy();
    expect(cert.course?.id).toBe(courseA.id);
    expect(cert.course?.name).toBe(courseA.name);
    expect(cert.level?.id).toBe(level1.id);
    expect(cert.level?.rank).toBe(level1.rank);
  });

  test("eligible endpoint supports pagination metadata and >100 rows", async () => {
    const created = await createStudents({
      count: 160,
      hierarchyNodeId: primaryNodeId,
      levelId: level1.id,
      startAt: 9000
    });

    await prisma.studentLevelCompletion.createMany({
      data: created.map((student, index) => ({
        tenantId: tenant.id,
        studentId: student.id,
        levelId: level1.id,
        completedAt: new Date(Date.now() - index * 1000)
      })),
      skipDuplicates: true
    });

    const completions = await prisma.studentLevelCompletion.findMany({
      where: {
        tenantId: tenant.id,
        levelId: level1.id,
        studentId: { in: created.map((row) => row.id) }
      },
      select: { id: true }
    });
    createdCompletionIds.push(...completions.map((row) => row.id));

    const eligible = await http
      .get(`/api/partner/certificates/eligible?levelId=${level1.id}&page=1&pageSize=120`)
      .set(authHeader(bpToken));

    expect(eligible.status).toBe(200);
    expect(eligible.body.data.page).toBe(1);
    expect(eligible.body.data.pageSize).toBe(120);
    expect(eligible.body.data.items.length).toBe(120);
    expect(eligible.body.data.total).toBeGreaterThanOrEqual(160);
    expect(eligible.body.data.totalPages).toBeGreaterThan(1);
  });
});
