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

const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08]);
const plainTextFile = Buffer.from("not-an-image", "utf8");
const oversizedPng = Buffer.alloc(2 * 1024 * 1024 + 1, 0);

async function createTenantWithNode({ tenantCode, nodeCode, nodeType = "SCHOOL", parentId = null }) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Uploads Tenant ${tenantCode}`,
      code: tenantCode
    },
    select: { id: true, code: true }
  });

  const node = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `Node ${nodeCode}`,
      code: nodeCode,
      type: nodeType,
      parentId
    },
    select: { id: true, code: true }
  });

  return { tenant, node };
}

async function cleanupTenantGraph({ tenantId, uploadedFiles = [] }) {
  void tenantId;

  await Promise.all(
    uploadedFiles.filter(Boolean).map((filePath) => fs.unlink(filePath).catch(() => {}))
  );
}

describe("LOCAL LOGO SELF-SERVICE UPLOADS", () => {
  test("BP upload stores logoFilePath and does not affect another tenant", async () => {
    const primaryTenantCode = `UPBP${Date.now()}`;
    const secondaryTenantCode = `UPBP${Date.now() + 1}`;
    const uploadedFiles = [];
    let primaryTenantId = "";
    let secondaryTenantId = "";

    try {
      const { tenant: primaryTenant, node: primaryNode } = await createTenantWithNode({
        tenantCode: primaryTenantCode,
        nodeCode: `NODE_${randomId("bp")}`
      });
      primaryTenantId = primaryTenant.id;

      const { tenant: secondaryTenant, node: secondaryNode } = await createTenantWithNode({
        tenantCode: secondaryTenantCode,
        nodeCode: `NODE_${randomId("bp")}`
      });
      secondaryTenantId = secondaryTenant.id;

      const primaryUser = await ensureAuthUser({
        tenantCode: primaryTenant.code,
        username: `bp_${randomId("usr")}`,
        email: `${primaryTenantCode.toLowerCase()}@abacusweb.local`,
        role: "BP",
        hierarchyNodeCode: primaryNode.code
      });

      const secondaryUser = await ensureAuthUser({
        tenantCode: secondaryTenant.code,
        username: `bp_${randomId("usr")}`,
        email: `${secondaryTenantCode.toLowerCase()}@abacusweb.local`,
        role: "BP",
        hierarchyNodeCode: secondaryNode.code
      });

      const primaryPartner = await prisma.businessPartner.create({
        data: {
          tenantId: primaryTenant.id,
          name: "Primary Partner",
          code: `BP-${randomId("primary")}`,
          displayName: "Primary Partner",
          status: "ACTIVE",
          isActive: true,
          contactEmail: primaryUser.email,
          hierarchyNodeId: primaryNode.id,
          subscriptionStatus: "ACTIVE",
          createdByUserId: primaryUser.id
        },
        select: { id: true }
      });

      const secondaryPartner = await prisma.businessPartner.create({
        data: {
          tenantId: secondaryTenant.id,
          name: "Secondary Partner",
          code: `BP-${randomId("secondary")}`,
          displayName: "Secondary Partner",
          status: "ACTIVE",
          isActive: true,
          contactEmail: secondaryUser.email,
          hierarchyNodeId: secondaryNode.id,
          subscriptionStatus: "ACTIVE",
          createdByUserId: secondaryUser.id
        },
        select: { id: true }
      });

      const login = await loginAs({ username: primaryUser.username, tenantCode: primaryTenant.code });
      expect(login.statusCode).toBe(200);

      const response = await http
        .post("/api/uploads/logo")
        .set(authHeader(login.body.data.access_token))
        .attach("file", onePixelPng, { filename: "Primary Partner.png", contentType: "image/png" });

      expect(response.statusCode).toBe(200);
      expect(response.body?.data?.entityType).toBe("BUSINESS_PARTNER");
      expect(response.body?.data?.logoUrl).toContain("/uploads/logos/");
      expect(response.body?.data?.logoFilePath).toContain("logos/");

      const updatedPrimary = await prisma.businessPartner.findUnique({
        where: { id: primaryPartner.id },
        select: { logoPath: true, logoFilePath: true, logoUrl: true }
      });
      const untouchedSecondary = await prisma.businessPartner.findUnique({
        where: { id: secondaryPartner.id },
        select: { logoPath: true, logoFilePath: true, logoUrl: true }
      });

      expect(updatedPrimary?.logoPath).toBeTruthy();
      expect(updatedPrimary?.logoFilePath).toMatch(/^logos\//);
      expect(updatedPrimary?.logoUrl).toContain("/uploads/logos/");
      expect(untouchedSecondary?.logoPath).toBeNull();
      expect(untouchedSecondary?.logoFilePath).toBeNull();
      expect(untouchedSecondary?.logoUrl).toBeNull();

      uploadedFiles.push(path.join(process.cwd(), "uploads", updatedPrimary.logoFilePath));
    } finally {
      if (primaryTenantId) {
        await cleanupTenantGraph({ tenantId: primaryTenantId, uploadedFiles });
      }
      if (secondaryTenantId) {
        await cleanupTenantGraph({ tenantId: secondaryTenantId });
      }
    }
  }, 30000);

  test("FRANCHISE upload accepts JPG and stores logoFilePath", async () => {
    const tenantCode = `UPFR${Date.now()}`;
    const uploadedFiles = [];
    let tenantId = "";

    try {
      const { tenant, node } = await createTenantWithNode({
        tenantCode,
        nodeCode: `NODE_${randomId("fr")}`,
        nodeType: "BRANCH"
      });
      tenantId = tenant.id;

      const user = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `fr_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}@abacusweb.local`,
        role: "FRANCHISE",
        hierarchyNodeCode: node.code
      });

      const login = await loginAs({ username: user.username, tenantCode: tenant.code });
      expect(login.statusCode).toBe(200);

      const response = await http
        .post("/api/uploads/logo")
        .set(authHeader(login.body.data.access_token))
        .attach("file", fakeJpeg, { filename: "Franchise Mark.jpg", contentType: "image/jpeg" });

      expect(response.statusCode).toBe(200);
      expect(response.body?.data?.entityType).toBe("FRANCHISE");
      expect(response.body?.data?.logoFilePath).toMatch(/^logos\//);

      const profile = await prisma.franchiseProfile.findUnique({
        where: { authUserId: user.id },
        select: { logoPath: true, logoFilePath: true, logoUrl: true }
      });

      expect(profile?.logoPath).toBeTruthy();
      expect(profile?.logoFilePath).toMatch(/^logos\//);
      expect(profile?.logoUrl).toContain("/uploads/logos/");

      uploadedFiles.push(path.join(process.cwd(), "uploads", profile.logoFilePath));
    } finally {
      if (tenantId) {
        await cleanupTenantGraph({ tenantId, uploadedFiles });
      }
    }
  }, 30000);

  test("CENTER delete clears local logo fields and restores inherited branding mode", async () => {
    const tenantCode = `UPCE${Date.now()}`;
    let tenantId = "";

    try {
      const { tenant, node } = await createTenantWithNode({
        tenantCode,
        nodeCode: `NODE_${randomId("ce")}`
      });
      tenantId = tenant.id;

      const user = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `ce_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}@abacusweb.local`,
        role: "CENTER",
        hierarchyNodeCode: node.code
      });

      const login = await loginAs({ username: user.username, tenantCode: tenant.code });
      expect(login.statusCode).toBe(200);

      const uploadResponse = await http
        .post("/api/uploads/logo")
        .set(authHeader(login.body.data.access_token))
        .attach("file", onePixelPng, { filename: "center.png", contentType: "image/png" });

      expect(uploadResponse.statusCode).toBe(200);

      const deleteResponse = await http
        .delete("/api/uploads/logo")
        .set(authHeader(login.body.data.access_token));

      expect(deleteResponse.statusCode).toBe(200);

      const profile = await prisma.centerProfile.findUnique({
        where: { authUserId: user.id },
        select: {
          logoPath: true,
          logoFilePath: true,
          logoUrl: true,
          customLogoUrl: true,
          brandingMode: true,
          inheritBranding: true
        }
      });

      expect(profile?.logoPath).toBeNull();
      expect(profile?.logoFilePath).toBeNull();
      expect(profile?.logoUrl).toBeNull();
      expect(profile?.customLogoUrl).toBeNull();
      expect(profile?.brandingMode).toBe("INHERIT_FRANCHISE");
      expect(profile?.inheritBranding).toBe(true);
    } finally {
      if (tenantId) {
        await cleanupTenantGraph({ tenantId });
      }
    }
  }, 30000);

  test("rejects invalid mime types", async () => {
    const tenantCode = `UPIV${Date.now()}`;
    let tenantId = "";

    try {
      const { tenant, node } = await createTenantWithNode({
        tenantCode,
        nodeCode: `NODE_${randomId("fr")}`,
        nodeType: "BRANCH"
      });
      tenantId = tenant.id;

      const user = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `fr_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}@abacusweb.local`,
        role: "FRANCHISE",
        hierarchyNodeCode: node.code
      });

      const login = await loginAs({ username: user.username, tenantCode: tenant.code });
      expect(login.statusCode).toBe(200);

      const response = await http
        .post("/api/uploads/logo")
        .set(authHeader(login.body.data.access_token))
        .attach("file", plainTextFile, { filename: "brand.txt", contentType: "text/plain" });

      expect(response.statusCode).toBe(400);
      expect(response.body?.error_code).toBe("INVALID_FILE_TYPE");
    } finally {
      if (tenantId) {
        await cleanupTenantGraph({ tenantId });
      }
    }
  }, 30000);

  test("rejects files larger than 2 MB", async () => {
    const tenantCode = `UPLG${Date.now()}`;
    let tenantId = "";

    try {
      const { tenant, node } = await createTenantWithNode({
        tenantCode,
        nodeCode: `NODE_${randomId("ce")}`
      });
      tenantId = tenant.id;

      const user = await ensureAuthUser({
        tenantCode: tenant.code,
        username: `ce_${randomId("usr")}`,
        email: `${tenantCode.toLowerCase()}@abacusweb.local`,
        role: "CENTER",
        hierarchyNodeCode: node.code
      });

      const login = await loginAs({ username: user.username, tenantCode: tenant.code });
      expect(login.statusCode).toBe(200);

      const response = await http
        .post("/api/uploads/logo")
        .set(authHeader(login.body.data.access_token))
        .attach("file", oversizedPng, { filename: "oversized.png", contentType: "image/png" });

      expect(response.statusCode).toBe(413);
      expect(response.body?.error_code).toBe("FILE_TOO_LARGE");
    } finally {
      if (tenantId) {
        await cleanupTenantGraph({ tenantId });
      }
    }
  }, 30000);

  test("requires authentication", async () => {
    const response = await http
      .post("/api/uploads/logo")
      .attach("file", onePixelPng, { filename: "logo.png", contentType: "image/png" });

    expect(response.statusCode).toBe(401);
  });
});