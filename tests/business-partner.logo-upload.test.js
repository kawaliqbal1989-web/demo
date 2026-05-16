import fs from "fs/promises";
import path from "path";
import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "./helpers/test-helpers.js";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Vv0AAAAASUVORK5CYII=",
  "base64"
);

describe("BUSINESS PARTNER LOGO UPLOAD", () => {
  test("BP cannot self-mutate branding and SUPERADMIN can manage branding through admin endpoints", async () => {
    const superadminLogin = await loginAs({ username: "SA001" });
    expect(superadminLogin.statusCode).toBe(200);
    const saToken = superadminLogin.body.data.access_token;

    const tenantCode = `BPGOV${Date.now()}`;
    let tenantId = "";
    let nodeId = "";
    let bpUserId = "";
    let partnerId = "";
    let uploadedFilePath = "";

    try {
      const tenant = await prisma.tenant.create({
        data: {
          name: `Governance Tenant ${tenantCode}`,
          code: tenantCode
        },
        select: { id: true, code: true }
      });
      tenantId = tenant.id;

      const nodeCode = `BP_${randomId("node")}`;
      const node = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "BP Governance Node",
          code: nodeCode,
          type: "SCHOOL"
        },
        select: { id: true }
      });
      nodeId = node.id;

      const bpUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `bp_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_bp@abacusweb.local`,
        role: "BP",
        hierarchyNodeCode: nodeCode
      });
      bpUserId = bpUser.id;

      const partner = await prisma.businessPartner.create({
        data: {
          tenantId,
          name: "Governed Partner",
          code: `BP-${randomId("gov")}`,
          displayName: "Governed Partner",
          status: "ACTIVE",
          isActive: true,
          contactEmail: bpUser.email,
          hierarchyNodeId: node.id,
          subscriptionStatus: "ACTIVE",
          createdByUserId: bpUser.id
        },
        select: { id: true }
      });
      partnerId = partner.id;

      const bpLogin = await loginAs({ username: bpUser.username, tenantCode: tenant.code });
      expect(bpLogin.statusCode).toBe(200);
      const bpToken = bpLogin.body.data.access_token;

      const deniedSelfUpload = await http
        .post("/api/uploads/logo")
        .set(authHeader(bpToken))
        .attach("file", onePixelPng, { filename: "self.png", contentType: "image/png" });

      expect(deniedSelfUpload.statusCode).toBe(403);

      const uploadResponse = await http
        .post(`/api/admin/bp/${partner.id}/branding/upload`)
        .set(authHeader(saToken))
        .attach("file", onePixelPng, { filename: "managed.webp", contentType: "image/webp" });

      expect(uploadResponse.statusCode).toBe(200);
      expect(uploadResponse.body?.success).toBe(true);
      expect(uploadResponse.body?.data?.logoUrl).toContain("/uploads/logos/");

      const brandingResponse = await http
        .get(`/api/admin/bp/${partner.id}/branding`)
        .set(authHeader(saToken));

      expect(brandingResponse.statusCode).toBe(200);
      expect(brandingResponse.body?.data?.brandingUpdatedAt).toBeTruthy();
      expect(brandingResponse.body?.data?.brandingUpdatedByUserId).toBeTruthy();
      expect(brandingResponse.body?.data?.brandingUpdatedBy?.id).toBeTruthy();

      const updated = await prisma.businessPartner.findUnique({
        where: { id: partner.id },
        select: {
          logoFilePath: true,
          logoUrl: true,
          brandingUpdatedAt: true,
          brandingUpdatedByUserId: true
        }
      });

      expect(updated?.logoUrl).toContain("/uploads/logos/");
      expect(updated?.logoFilePath).toContain("logos/");
      expect(updated?.brandingUpdatedAt).toBeTruthy();
      expect(updated?.brandingUpdatedByUserId).toBeTruthy();

      uploadedFilePath = path.join(process.cwd(), "uploads", updated.logoFilePath);

      const removeResponse = await http
        .delete(`/api/admin/bp/${partner.id}/branding/remove`)
        .set(authHeader(saToken));

      expect(removeResponse.statusCode).toBe(200);
      expect(removeResponse.body?.data?.logoUrl).toBeNull();

      const afterRemove = await prisma.businessPartner.findUnique({
        where: { id: partner.id },
        select: { logoUrl: true, logoPath: true, logoFilePath: true }
      });

      expect(afterRemove?.logoUrl).toBeNull();
      expect(afterRemove?.logoPath).toBeNull();
      expect(afterRemove?.logoFilePath).toBeNull();
    } finally {
      if (partnerId) {
        await prisma.businessPartner.deleteMany({ where: { id: partnerId } }).catch(() => {});
      }
      if (bpUserId) {
        await prisma.refreshToken.deleteMany({ where: { userId: bpUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: bpUserId } }).catch(() => {});
      }
      if (nodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: nodeId } }).catch(() => {});
      }
      if (tenantId) {
        await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
      }
      if (uploadedFilePath) {
        await fs.unlink(uploadedFilePath).catch(() => {});
      }
    }
  }, 30000);

  test("SUPERADMIN can upload a logo for a partner in another tenant", async () => {
    const login = await loginAs({ username: "SA001" });
    expect(login.statusCode).toBe(200);

    const token = login.body.data.access_token;
    const tenantCode = `BPLOGO${Date.now()}`;

    let uploadedFilePath = "";
    let tenantId = "";
    let nodeId = "";
    let actorId = "";
    let partnerId = "";

    try {
      const tenant = await prisma.tenant.create({
        data: {
          name: `Logo Tenant ${tenantCode}`,
          code: tenantCode
        },
        select: { id: true, code: true }
      });
      tenantId = tenant.id;

      const nodeCode = `NODE_${randomId("bp")}`;
      const node = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: `Logo Node ${tenantCode}`,
          code: nodeCode,
          type: "SCHOOL"
        },
        select: { id: true }
      });
      nodeId = node.id;

      const actor = await ensureAuthUser({
        tenantCode: tenant.code,
        email: `${tenantCode.toLowerCase()}@abacusweb.local`,
        role: "BP",
        hierarchyNodeCode: nodeCode
      });
      actorId = actor.id;

      const partner = await prisma.businessPartner.create({
        data: {
          tenantId,
          name: `Partner ${tenantCode}`,
          code: `BP-${randomId("logo")}`,
          displayName: `Partner ${tenantCode}`,
          status: "ACTIVE",
          isActive: true,
          contactEmail: actor.email,
          hierarchyNodeId: nodeId,
          subscriptionStatus: "ACTIVE",
          subscriptionExpiresAt: null,
          gracePeriodUntil: null,
          createdByUserId: actor.id
        },
        select: { id: true }
      });
      partnerId = partner.id;

      const response = await http
        .post(`/api/business-partners/${partner.id}/logo`)
        .set(authHeader(token))
        .attach("file", onePixelPng, { filename: "logo.png", contentType: "image/png" });

      expect(response.statusCode).toBe(200);
      expect(response.body?.success).toBe(true);
      expect(response.body?.data?.entityId).toBe(partner.id);
      expect(response.body?.data?.logoUrl).toContain("/uploads/logos/");

      const updated = await prisma.businessPartner.findUnique({
        where: { id: partner.id },
        select: { logoPath: true, logoUrl: true }
      });

      expect(updated?.logoPath).toBeTruthy();
      expect(updated?.logoUrl).toContain("/uploads/logos/");

      uploadedFilePath = path.join(process.cwd(), "uploads", "logos", updated.logoPath);
    } finally {
      if (partnerId) {
        await prisma.businessPartner.deleteMany({ where: { id: partnerId } });
      }

      if (actorId) {
        await prisma.refreshToken.deleteMany({ where: { userId: actorId } });
        await prisma.authUser.deleteMany({ where: { id: actorId } });
      }

      if (nodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: nodeId } });
      }

      if (tenantId) {
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
      }

      if (uploadedFilePath) {
        await fs.unlink(uploadedFilePath).catch(() => {});
      }
    }
  }, 30000);

  test("CENTER branding resolves to the center override instead of the partner logo", async () => {
    const tenantCode = `BRC${Date.now()}`;
    let tenantId = "";
    let bpNodeId = "";
    let franchiseNodeId = "";
    let centerNodeId = "";
    let bpUserId = "";
    let franchiseUserId = "";
    let centerUserId = "";
    let partnerId = "";
    let franchiseId = "";
    let centerId = "";

    try {
      const tenant = await prisma.tenant.create({
        data: {
          name: `Branding Tenant ${tenantCode}`,
          code: tenantCode
        },
        select: { id: true, code: true }
      });
      tenantId = tenant.id;

      const bpNodeCode = `BP_${randomId("node")}`;
      const bpNode = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "BP Root",
          code: bpNodeCode,
          type: "SCHOOL"
        },
        select: { id: true }
      });
      bpNodeId = bpNode.id;

      const franchiseNodeCode = `FR_${randomId("node")}`;
      const franchiseNode = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "Franchise Root",
          code: franchiseNodeCode,
          type: "BRANCH",
          parentId: bpNode.id
        },
        select: { id: true }
      });
      franchiseNodeId = franchiseNode.id;

      const centerNodeCode = `CE_${randomId("node")}`;
      const centerNode = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "Center Root",
          code: centerNodeCode,
          type: "SCHOOL",
          parentId: franchiseNode.id
        },
        select: { id: true }
      });
      centerNodeId = centerNode.id;

      const bpUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `bp_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_bp@abacusweb.local`,
        role: "BP",
        hierarchyNodeCode: bpNodeCode
      });
      bpUserId = bpUser.id;

      const franchiseUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `fr_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_fr@abacusweb.local`,
        role: "FRANCHISE",
        hierarchyNodeCode: franchiseNodeCode
      });
      franchiseUserId = franchiseUser.id;

      const centerUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `ce_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_ce@abacusweb.local`,
        role: "CENTER",
        hierarchyNodeCode: centerNodeCode
      });
      centerUserId = centerUser.id;

      const partner = await prisma.businessPartner.create({
        data: {
          tenantId,
          name: "Partner Brand",
          code: `BP-${randomId("brand")}`,
          displayName: "Partner Brand",
          status: "ACTIVE",
          isActive: true,
          contactEmail: bpUser.email,
          hierarchyNodeId: bpNode.id,
          logoUrl: "https://cdn.example.com/partner-logo.png",
          subscriptionStatus: "ACTIVE",
          createdByUserId: bpUser.id
        },
        select: { id: true }
      });
      partnerId = partner.id;

      const existingFranchise = await prisma.franchiseProfile.findUnique({
        where: { authUserId: franchiseUser.id },
        select: { id: true }
      });

      const franchise = await prisma.franchiseProfile.update({
        where: { id: existingFranchise.id },
        data: {
          businessPartnerId: partner.id,
          code: `FR-${randomId("brand")}`,
          name: "Franchise Brand",
          displayName: "Franchise Brand",
          status: "ACTIVE",
          isActive: true,
          inheritBranding: true,
          logoUrl: null
        },
        select: { id: true }
      });
      franchiseId = franchise.id;

      const existingCenter = await prisma.centerProfile.findUnique({
        where: { authUserId: centerUser.id },
        select: { id: true }
      });

      const center = await prisma.centerProfile.update({
        where: { id: existingCenter.id },
        data: {
          franchiseProfileId: franchise.id,
          code: `CE-${randomId("brand")}`,
          name: "Center Legal Name",
          displayName: "Mini Center Brand",
          status: "ACTIVE",
          isActive: true,
          inheritBranding: false,
          logoUrl: "https://cdn.example.com/center-logo.png"
        },
        select: { id: true }
      });
      centerId = center.id;

      const login = await loginAs({ username: centerUser.username, tenantCode: tenant.code });
      expect(login.statusCode).toBe(200);

      const response = await http
        .get("/api/branding/me")
        .set(authHeader(login.body.data.access_token));

      expect(response.statusCode).toBe(200);
      expect(response.body?.data?.businessPartner?.brandingSource).toBe("CENTER");
      expect(response.body?.data?.businessPartner?.displayName).toBe("Mini Center Brand");
      expect(response.body?.data?.businessPartner?.logoUrl).toContain("center-logo.png");
      expect(response.body?.data?.certificateTemplate?.bpLogoUrl).toContain("center-logo.png");
    } finally {
      if (centerId) {
        await prisma.centerProfile.deleteMany({ where: { id: centerId } });
      }
      if (franchiseId) {
        await prisma.franchiseProfile.deleteMany({ where: { id: franchiseId } });
      }
      if (partnerId) {
        await prisma.businessPartner.deleteMany({ where: { id: partnerId } });
      }
      if (centerUserId) {
        await prisma.centerProfile.deleteMany({ where: { authUserId: centerUserId } });
        await prisma.businessPartner.deleteMany({ where: { createdByUserId: centerUserId } });
      }
      if (franchiseUserId) {
        await prisma.franchiseProfile.deleteMany({ where: { authUserId: franchiseUserId } });
        await prisma.businessPartner.deleteMany({ where: { createdByUserId: franchiseUserId } });
      }
      if (centerUserId) {
        await prisma.refreshToken.deleteMany({ where: { userId: centerUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: centerUserId } }).catch(() => {});
      }
      if (franchiseUserId) {
        await prisma.refreshToken.deleteMany({ where: { userId: franchiseUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: franchiseUserId } }).catch(() => {});
      }
      if (bpUserId) {
        await prisma.refreshToken.deleteMany({ where: { userId: bpUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: bpUserId } }).catch(() => {});
      }
      if (centerNodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: centerNodeId } }).catch(() => {});
      }
      if (franchiseNodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: franchiseNodeId } }).catch(() => {});
      }
      if (bpNodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: bpNodeId } }).catch(() => {});
      }
      if (tenantId) {
        await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
      }
    }
  }, 30000);

  test("partner-issued certificates persist the student's center branding snapshot for public verification", async () => {
    const tenantCode = `CERT${Date.now()}`;
    let tenantId = "";
    let bpNodeId = "";
    let franchiseNodeId = "";
    let centerNodeId = "";
    let bpUserId = "";
    let franchiseUserId = "";
    let centerUserId = "";
    let partnerId = "";
    let franchiseId = "";
    let centerId = "";
    let levelId = "";
    let studentId = "";
    let certificateId = "";

    try {
      const tenant = await prisma.tenant.create({
        data: {
          name: `Certificate Tenant ${tenantCode}`,
          code: tenantCode
        },
        select: { id: true, code: true }
      });
      tenantId = tenant.id;

      const bpNodeCode = `BP_${randomId("node")}`;
      const bpNode = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "BP Root",
          code: bpNodeCode,
          type: "SCHOOL"
        },
        select: { id: true }
      });
      bpNodeId = bpNode.id;

      const franchiseNodeCode = `FR_${randomId("node")}`;
      const franchiseNode = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "Franchise Root",
          code: franchiseNodeCode,
          type: "BRANCH",
          parentId: bpNode.id
        },
        select: { id: true }
      });
      franchiseNodeId = franchiseNode.id;

      const centerNodeCode = `CE_${randomId("node")}`;
      const centerNode = await prisma.hierarchyNode.create({
        data: {
          tenantId,
          name: "Center Root",
          code: centerNodeCode,
          type: "SCHOOL",
          parentId: franchiseNode.id
        },
        select: { id: true }
      });
      centerNodeId = centerNode.id;

      const bpUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `bp_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_bp@abacusweb.local`,
        role: "BP",
        hierarchyNodeCode: bpNodeCode
      });
      bpUserId = bpUser.id;

      const franchiseUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `fr_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_fr@abacusweb.local`,
        role: "FRANCHISE",
        hierarchyNodeCode: franchiseNodeCode
      });
      franchiseUserId = franchiseUser.id;

      const centerUser = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `ce_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}_ce@abacusweb.local`,
        role: "CENTER",
        hierarchyNodeCode: centerNodeCode
      });
      centerUserId = centerUser.id;

      const partner = await prisma.businessPartner.create({
        data: {
          tenantId,
          name: "Partner Brand",
          code: `BP-${randomId("brand")}`,
          displayName: "Partner Brand",
          status: "ACTIVE",
          isActive: true,
          contactEmail: bpUser.email,
          hierarchyNodeId: bpNode.id,
          logoUrl: "https://cdn.example.com/partner-logo.png",
          subscriptionStatus: "ACTIVE",
          createdByUserId: bpUser.id
        },
        select: { id: true }
      });
      partnerId = partner.id;

      const existingFranchise = await prisma.franchiseProfile.findUnique({
        where: { authUserId: franchiseUser.id },
        select: { id: true }
      });
      const franchise = await prisma.franchiseProfile.update({
        where: { id: existingFranchise.id },
        data: {
          businessPartnerId: partner.id,
          code: `FR-${randomId("brand")}`,
          name: "Franchise Brand",
          displayName: "Franchise Brand",
          status: "ACTIVE",
          isActive: true,
          inheritBranding: true,
          logoUrl: null
        },
        select: { id: true }
      });
      franchiseId = franchise.id;

      const existingCenter = await prisma.centerProfile.findUnique({
        where: { authUserId: centerUser.id },
        select: { id: true }
      });
      const center = await prisma.centerProfile.update({
        where: { id: existingCenter.id },
        data: {
          franchiseProfileId: franchise.id,
          code: `CE-${randomId("brand")}`,
          name: "Center Legal Name",
          displayName: "Mini Center Brand",
          customBrandName: "Mini Center Brand",
          brandingMode: "CUSTOM_CENTER",
          status: "ACTIVE",
          isActive: true,
          inheritBranding: false,
          customLogoUrl: "https://cdn.example.com/center-logo.png",
          logoUrl: "https://cdn.example.com/legacy-center-logo.png",
          commercializationTier: "MINI_CENTER",
          brandingActive: true
        },
        select: { id: true }
      });
      centerId = center.id;

      const level = await prisma.level.create({
        data: {
          tenantId,
          name: `Level ${randomId("lvl")}`,
          rank: 1
        },
        select: { id: true }
      });
      levelId = level.id;

      const student = await prisma.student.create({
        data: {
          tenantId,
          admissionNo: `ADM-${randomId("stu")}`,
          firstName: "Mini",
          lastName: "Student",
          hierarchyNodeId: centerNode.id,
          levelId: level.id,
          guardianName: "Guardian",
          guardianPhone: "9999999999",
          isActive: true
        },
        select: { id: true }
      });
      studentId = student.id;

      const login = await loginAs({ username: bpUser.username, tenantCode: tenant.code });
      expect(login.statusCode).toBe(200);

      const issueResponse = await http
        .post("/api/partner/certificates")
        .set(authHeader(login.body.data.access_token))
        .send({
          studentId: student.id,
          levelId: level.id,
          reason: "Milestone completion"
        });

      expect(issueResponse.statusCode).toBe(201);
      certificateId = issueResponse.body?.data?.id;

      const certificate = await prisma.certificate.findUnique({
        where: { id: certificateId },
        select: {
          verificationToken: true,
          brandingSnapshot: true,
          metadata: true
        }
      });

      expect(certificate?.brandingSnapshot?.organizationName).toBe("Mini Center Brand");
      expect(certificate?.brandingSnapshot?.organizationLogoUrl).toContain("center-logo.png");
      expect(certificate?.brandingSnapshot?.commercializationTier).toBe("MINI_CENTER");
      expect(certificate?.metadata?.brandingSnapshot?.organizationName).toBe("Mini Center Brand");

      await prisma.centerProfile.update({
        where: { id: center.id },
        data: {
          customBrandName: "Updated Center Brand",
          customLogoUrl: "https://cdn.example.com/updated-center-logo.png"
        }
      });

      const verifyResponse = await http.get(`/api/public/certificates/verify/${certificate.verificationToken}`);
      expect(verifyResponse.statusCode).toBe(200);
      expect(verifyResponse.body?.data?.organizationName).toBe("Mini Center Brand");
      expect(verifyResponse.body?.data?.organizationLogoUrl).toContain("center-logo.png");
      expect(verifyResponse.body?.data?.brandingSnapshot?.organizationName).toBe("Mini Center Brand");
    } finally {
      if (certificateId) {
        await prisma.certificate.deleteMany({ where: { id: certificateId } }).catch(() => {});
      }
      if (studentId) {
        await prisma.student.deleteMany({ where: { id: studentId } }).catch(() => {});
      }
      if (levelId) {
        await prisma.level.deleteMany({ where: { id: levelId } }).catch(() => {});
      }
      if (centerId) {
        await prisma.centerProfile.deleteMany({ where: { id: centerId } }).catch(() => {});
      }
      if (franchiseId) {
        await prisma.franchiseProfile.deleteMany({ where: { id: franchiseId } }).catch(() => {});
      }
      if (partnerId) {
        await prisma.businessPartner.deleteMany({ where: { id: partnerId } }).catch(() => {});
      }
      if (centerUserId) {
        await prisma.centerProfile.deleteMany({ where: { authUserId: centerUserId } }).catch(() => {});
        await prisma.refreshToken.deleteMany({ where: { userId: centerUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: centerUserId } }).catch(() => {});
      }
      if (franchiseUserId) {
        await prisma.franchiseProfile.deleteMany({ where: { authUserId: franchiseUserId } }).catch(() => {});
        await prisma.refreshToken.deleteMany({ where: { userId: franchiseUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: franchiseUserId } }).catch(() => {});
      }
      if (bpUserId) {
        await prisma.businessPartner.deleteMany({ where: { createdByUserId: bpUserId } }).catch(() => {});
        await prisma.refreshToken.deleteMany({ where: { userId: bpUserId } }).catch(() => {});
        await prisma.authUser.deleteMany({ where: { id: bpUserId } }).catch(() => {});
      }
      if (centerNodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: centerNodeId } }).catch(() => {});
      }
      if (franchiseNodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: franchiseNodeId } }).catch(() => {});
      }
      if (bpNodeId) {
        await prisma.hierarchyNode.deleteMany({ where: { id: bpNodeId } }).catch(() => {});
      }
      if (tenantId) {
        await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
      }
    }
  }, 30000);
});