import fs from "fs/promises";
import path from "path";
import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Vv0AAAAASUVORK5CYII=",
  "base64"
);

function extractUploadRelativePath(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  const marker = "/uploads/";
  const index = value.indexOf(marker);
  if (index < 0) return null;
  return value.slice(index + 1);
}

describe("BP CERTIFICATE TEMPLATE AUTHORIZATION", () => {
  let tenantId = "";
  let tenantCode = "";

  let bp1UserId = "";
  let bp2UserId = "";
  let bp1PartnerId = "";
  let bp2PartnerId = "";

  let node1Id = "";
  let node2Id = "";
  let node1Code = "";
  let node2Code = "";

  let bp1Token = "";
  let bp2Token = "";
  let superadminToken = "";

  const uploadedRelativePaths = new Set();

  beforeAll(async () => {
    tenantCode = `BPTPL${Date.now()}`;

    const tenant = await prisma.tenant.create({
      data: {
        name: `BP Template Tenant ${tenantCode}`,
        code: tenantCode
      },
      select: { id: true }
    });
    tenantId = tenant.id;

    node1Code = `BP1_${randomId("node")}`;
    node2Code = `BP2_${randomId("node")}`;

    const node1 = await prisma.hierarchyNode.create({
      data: {
        tenantId,
        name: "BP1 Root",
        code: node1Code,
        type: "REGION",
        parentId: null
      },
      select: { id: true }
    });
    node1Id = node1.id;

    const node2 = await prisma.hierarchyNode.create({
      data: {
        tenantId,
        name: "BP2 Root",
        code: node2Code,
        type: "REGION",
        parentId: null
      },
      select: { id: true }
    });
    node2Id = node2.id;

    const bp1Email = `${tenantCode.toLowerCase()}_bp1@abacusweb.local`;
    const bp2Email = `${tenantCode.toLowerCase()}_bp2@abacusweb.local`;

    const bp1User = await ensureAuthUser({
      tenantCode,
      username: `BP1_${randomId("usr")}`,
      email: bp1Email,
      role: "BP",
      hierarchyNodeCode: node1Code
    });
    bp1UserId = bp1User.id;

    const bp2User = await ensureAuthUser({
      tenantCode,
      username: `BP2_${randomId("usr")}`,
      email: bp2Email,
      role: "BP",
      hierarchyNodeCode: node2Code
    });
    bp2UserId = bp2User.id;

    const bp1Partner = await prisma.businessPartner.create({
      data: {
        tenantId,
        name: "Partner One",
        code: `BP1-${randomId("code")}`,
        displayName: "Partner One",
        status: "ACTIVE",
        isActive: true,
        contactEmail: bp1Email,
        hierarchyNodeId: node1Id,
        subscriptionStatus: "ACTIVE",
        createdByUserId: bp1UserId
      },
      select: { id: true }
    });
    bp1PartnerId = bp1Partner.id;

    const bp2Partner = await prisma.businessPartner.create({
      data: {
        tenantId,
        name: "Partner Two",
        code: `BP2-${randomId("code")}`,
        displayName: "Partner Two",
        status: "ACTIVE",
        isActive: true,
        contactEmail: bp2Email,
        hierarchyNodeId: node2Id,
        subscriptionStatus: "ACTIVE",
        createdByUserId: bp2UserId
      },
      select: { id: true }
    });
    bp2PartnerId = bp2Partner.id;

    const bp1Login = await loginAs({ username: bp1User.username, tenantCode });
    expect(bp1Login.statusCode).toBe(200);
    bp1Token = bp1Login.body?.data?.access_token;

    const bp2Login = await loginAs({ username: bp2User.username, tenantCode });
    expect(bp2Login.statusCode).toBe(200);
    bp2Token = bp2Login.body?.data?.access_token;

    const saLogin = await loginAs({ username: "SA001" });
    expect(saLogin.statusCode).toBe(200);
    superadminToken = saLogin.body?.data?.access_token;
  });

  afterAll(async () => {
    if (bp1PartnerId || bp2PartnerId) {
      await prisma.certificateTemplate.deleteMany({
        where: {
          businessPartnerId: {
            in: [bp1PartnerId, bp2PartnerId].filter(Boolean)
          }
        }
      }).catch(() => {});
    }

    if (bp1PartnerId) {
      await prisma.businessPartner.deleteMany({ where: { id: bp1PartnerId } }).catch(() => {});
    }
    if (bp2PartnerId) {
      await prisma.businessPartner.deleteMany({ where: { id: bp2PartnerId } }).catch(() => {});
    }

    if (bp1UserId || bp2UserId) {
      await prisma.refreshToken.deleteMany({
        where: {
          userId: {
            in: [bp1UserId, bp2UserId].filter(Boolean)
          }
        }
      }).catch(() => {});
    }

    if (bp1UserId) {
      await prisma.authUser.deleteMany({ where: { id: bp1UserId } }).catch(() => {});
    }
    if (bp2UserId) {
      await prisma.authUser.deleteMany({ where: { id: bp2UserId } }).catch(() => {});
    }

    if (node1Id) {
      await prisma.hierarchyNode.deleteMany({ where: { id: node1Id } }).catch(() => {});
    }
    if (node2Id) {
      await prisma.hierarchyNode.deleteMany({ where: { id: node2Id } }).catch(() => {});
    }

    if (tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }

    await Promise.all(
      [...uploadedRelativePaths].map(async (relativePath) => {
        const absolute = path.join(process.cwd(), relativePath);
        await fs.unlink(absolute).catch(() => {});
      })
    );
  });

  test("BP can save certificate template settings", async () => {
    const response = await http
      .put("/api/partner/certificate-template")
      .set(authHeader(bp1Token))
      .send({
        title: "BP1 Certificate Title",
        signatoryName: "Partner Admin",
        signatoryDesignation: "Director",
        layout: { theme: "classic" }
      });

    expect(response.statusCode).toBe(200);
    expect(response.body?.success).toBe(true);
    expect(response.body?.data?.template?.title).toBe("BP1 Certificate Title");
    expect(response.body?.data?.template?.signatoryName).toBe("Partner Admin");
  });

  test("BP can upload certificate template assets", async () => {
    const uploads = [
      ["/api/partner/certificate-template/signature", "signatureImageUrl"],
      ["/api/partner/certificate-template/affiliation-logo", "affiliationLogoUrl"],
      ["/api/partner/certificate-template/stamp", "stampImageUrl"],
      ["/api/partner/certificate-template/background", "backgroundImageUrl"]
    ];

    for (const [endpoint, field] of uploads) {
      const response = await http
        .post(endpoint)
        .set(authHeader(bp1Token))
        .attach("file", onePixelPng, { filename: "asset.png", contentType: "image/png" });

      expect(response.statusCode).toBe(200);
      expect(response.body?.success).toBe(true);
      expect(response.body?.data?.template?.[field]).toContain("/uploads/");

      const relative = extractUploadRelativePath(response.body?.data?.template?.[field]);
      if (relative) {
        uploadedRelativePaths.add(relative);
      }
    }
  });

  test("unauthorized users are still blocked", async () => {
    const noAuth = await http
      .put("/api/partner/certificate-template")
      .send({ title: "No Auth" });

    expect(noAuth.statusCode).toBe(401);

    const superadminCall = await http
      .put("/api/partner/certificate-template")
      .set(authHeader(superadminToken))
      .send({ title: "Wrong Role" });

    expect(superadminCall.statusCode).toBe(403);
    expect(superadminCall.body?.error_code).toBe("ROLE_FORBIDDEN");
  });

  test("BP can modify only own template", async () => {
    const bp2Initial = await http
      .put("/api/partner/certificate-template")
      .set(authHeader(bp2Token))
      .send({ title: "BP2 Baseline" });

    expect(bp2Initial.statusCode).toBe(200);

    const bp1Update = await http
      .put("/api/partner/certificate-template")
      .set(authHeader(bp1Token))
      .send({ title: "BP1 Exclusive Update" });

    expect(bp1Update.statusCode).toBe(200);

    const bp1Template = await prisma.certificateTemplate.findUnique({
      where: { businessPartnerId: bp1PartnerId },
      select: { title: true }
    });

    const bp2Template = await prisma.certificateTemplate.findUnique({
      where: { businessPartnerId: bp2PartnerId },
      select: { title: true }
    });

    expect(bp1Template?.title).toBe("BP1 Exclusive Update");
    expect(bp2Template?.title).toBe("BP2 Baseline");
  });
});
