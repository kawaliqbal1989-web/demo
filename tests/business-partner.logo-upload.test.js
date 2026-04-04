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
      expect(response.body?.data?.id).toBe(partner.id);
      expect(response.body?.data?.logoUrl).toContain("/uploads/business-partner-logos/");

      const updated = await prisma.businessPartner.findUnique({
        where: { id: partner.id },
        select: { logoPath: true, logoUrl: true }
      });

      expect(updated?.logoPath).toBeTruthy();
      expect(updated?.logoUrl).toContain("/uploads/business-partner-logos/");

      uploadedFilePath = path.join(process.cwd(), "uploads", "business-partner-logos", updated.logoPath);
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
});