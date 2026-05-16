import { jest } from "@jest/globals";
import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { createOrUpdateOperationalEvent } from "../../src/services/operational-notification.service.js";

jest.setTimeout(120000);

async function createAuthUser({ tenantId, role, prefix }) {
  const suffix = randomId(prefix);
  return prisma.authUser.create({
    data: {
      tenantId,
      username: `${prefix}_${suffix}`,
      email: `${prefix}.${suffix}@abacusweb.local`,
      passwordHash: "test-hash",
      role,
      isActive: true
    }
  });
}

async function ensureBusinessPartnerContext(tenant, bpUser) {
  const superadminUser = await prisma.authUser.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      role: "SUPERADMIN",
      isActive: true
    },
    orderBy: { createdAt: "asc" }
  });

  const businessPartner = await prisma.businessPartner.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      contactEmail: String(bpUser.email || "").toLowerCase()
    },
    orderBy: { createdAt: "desc" }
  });

  const franchiseUser = await createAuthUser({ tenantId: tenant.id, role: "FRANCHISE", prefix: "bpopsfr" });
  const centerUser = await createAuthUser({ tenantId: tenant.id, role: "CENTER", prefix: "bpopsce" });

  const franchise = await prisma.franchiseProfile.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: businessPartner.id,
      authUserId: franchiseUser.id,
      code: `FR-${randomId("opsfr")}`,
      name: `Ops Franchise ${randomId("opsfrname")}`,
      displayName: `Ops Franchise ${randomId("opsfrdisp")}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  const center = await prisma.centerProfile.create({
    data: {
      tenantId: tenant.id,
      franchiseProfileId: franchise.id,
      authUserId: centerUser.id,
      code: `CE-${randomId("opsce")}`,
      name: `Ops Center ${randomId("opscename")}`,
      displayName: `Ops Center ${randomId("opscedisp")}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    businessPartner,
    center,
    franchise,
    superadminUser
  };
}

async function createForeignPartnerContext(tenant, createdByUserId) {
  const franchiseUser = await createAuthUser({ tenantId: tenant.id, role: "FRANCHISE", prefix: "bpopsforeignfr" });
  const centerUser = await createAuthUser({ tenantId: tenant.id, role: "CENTER", prefix: "bpopsforeignce" });
  const businessPartner = await prisma.businessPartner.create({
    data: {
      tenantId: tenant.id,
      name: `Foreign Ops Partner ${randomId("fbp")}`,
      code: `FBP-${randomId("fbp")}`,
      displayName: `Foreign Ops Partner ${randomId("fbpdisp")}`,
      status: "ACTIVE",
      isActive: true,
      contactEmail: `foreign.${randomId("fbp")}@abacusweb.local`,
      createdByUserId,
      subscriptionStatus: "ACTIVE"
    }
  });

  const franchise = await prisma.franchiseProfile.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: businessPartner.id,
      authUserId: franchiseUser.id,
      code: `FFR-${randomId("ffr")}`,
      name: `Foreign Ops Franchise ${randomId("ffrname")}`,
      displayName: `Foreign Ops Franchise ${randomId("ffrdisp")}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  const center = await prisma.centerProfile.create({
    data: {
      tenantId: tenant.id,
      franchiseProfileId: franchise.id,
      authUserId: centerUser.id,
      code: `FCE-${randomId("fce")}`,
      name: `Foreign Ops Center ${randomId("fcename")}`,
      displayName: `Foreign Ops Center ${randomId("fcedisp")}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    businessPartner,
    center,
    franchise
  };
}

async function createOperationalEventForUser({ tenantId, businessPartnerId, franchiseId, centerId, recipientUserId, severity, title, message, triggeredAt }) {
  return createOrUpdateOperationalEvent({
    tenantId,
    businessPartnerId,
    franchiseId,
    centerId,
    type: severity === "CRITICAL" ? "CRITICAL_ATTENDANCE" : "LOW_ATTENDANCE",
    category: "OPERATIONS",
    severity,
    title,
    message,
    metricKey: "attendancePercent",
    thresholdValue: 75,
    observedValue: severity === "CRITICAL" ? 52 : 68,
    sourceKind: "SNAPSHOT",
    sourceSnapshotDate: triggeredAt,
    sourceWindowKey: `window:${randomId("window")}`,
    fingerprint: `fp:${randomId("fp")}`,
    activeFingerprint: `active:${randomId("active")}`,
    triggeredAt,
    deepLinkPath: `/bp/franchises/${franchiseId}`,
    targets: [{
      recipientUserId,
      recipientRole: "BP",
      targetKey: `user:${recipientUserId}`
    }]
  });
}

describe("PARTNER OPERATIONAL NOTIFICATION APIs", () => {
  let bpToken;
  let bpUser;
  let tenant;
  let bpContext;
  let foreignContext;

  beforeAll(async () => {
    const bpLogin = await loginAs({ email: "bp.manager@abacusweb.local" });
    bpToken = bpLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    bpUser = await prisma.authUser.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        email: "bp.manager@abacusweb.local",
        role: "BP"
      }
    });

    bpContext = await ensureBusinessPartnerContext(tenant, bpUser);
    foreignContext = await createForeignPartnerContext(tenant, bpContext.superadminUser.id);
  });

  test("lists operational notifications with BP scope-safe filtering and stable sorting", async () => {
    await createOperationalEventForUser({
      tenantId: tenant.id,
      businessPartnerId: bpContext.businessPartner.id,
      franchiseId: bpContext.franchise.id,
      centerId: bpContext.center.id,
      recipientUserId: bpUser.id,
      severity: "WARNING",
      title: `Own warning ${randomId("warn")}`,
      message: "warning event",
      triggeredAt: new Date("2026-05-08T10:00:00.000Z")
    });

    const ownCritical = await createOperationalEventForUser({
      tenantId: tenant.id,
      businessPartnerId: bpContext.businessPartner.id,
      franchiseId: bpContext.franchise.id,
      centerId: bpContext.center.id,
      recipientUserId: bpUser.id,
      severity: "CRITICAL",
      title: `Own critical ${randomId("critical")}`,
      message: "critical event",
      triggeredAt: new Date("2026-05-09T10:00:00.000Z")
    });

    await createOperationalEventForUser({
      tenantId: tenant.id,
      businessPartnerId: foreignContext.businessPartner.id,
      franchiseId: foreignContext.franchise.id,
      centerId: foreignContext.center.id,
      recipientUserId: bpUser.id,
      severity: "CRITICAL",
      title: `Foreign critical ${randomId("foreign")}`,
      message: "foreign critical event",
      triggeredAt: new Date("2026-05-10T10:00:00.000Z")
    });

    const response = await http
      .get(`/api/partner/notifications/operational?severity=CRITICAL&limit=10&offset=0&sortBy=lastTriggeredAt&sortOrder=desc`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBeGreaterThanOrEqual(1);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notificationId: ownCritical.notification.id,
          businessPartnerId: bpContext.businessPartner.id,
          franchiseId: bpContext.franchise.id,
          centerId: bpContext.center.id,
          severity: "CRITICAL"
        })
      ])
    );
    expect(
      response.body.data.items.some((item) => item.businessPartnerId === foreignContext.businessPartner.id)
    ).toBe(false);
  });

  test("returns unread counts and supports recipient-scoped mark-read lifecycle", async () => {
    const created = await createOperationalEventForUser({
      tenantId: tenant.id,
      businessPartnerId: bpContext.businessPartner.id,
      franchiseId: bpContext.franchise.id,
      centerId: bpContext.center.id,
      recipientUserId: bpUser.id,
      severity: "HIGH",
      title: `Unread high ${randomId("high")}`,
      message: "unread high event",
      triggeredAt: new Date("2026-05-10T11:00:00.000Z")
    });

    const countsBefore = await http
      .get("/api/partner/notifications/operational/unread-count")
      .set(authHeader(bpToken));

    expect(countsBefore.status).toBe(200);
    expect(countsBefore.body.data.totalUnread).toBeGreaterThan(0);
    expect(countsBefore.body.data.highUnread).toBeGreaterThan(0);

    const markReadResponse = await http
      .patch(`/api/partner/notifications/operational/${created.notification.id}/read`)
      .set(authHeader(bpToken));

    expect(markReadResponse.status).toBe(200);
    expect(markReadResponse.body.data.readAt).toBeTruthy();

    const countsAfter = await http
      .get("/api/partner/notifications/operational/unread-count")
      .set(authHeader(bpToken));

    expect(countsAfter.status).toBe(200);
    expect(countsAfter.body.data.totalUnread).toBeLessThan(countsBefore.body.data.totalUnread);
  });

  test("mark-all-read respects filters and tenant-scoped BP access", async () => {
    await createOperationalEventForUser({
      tenantId: tenant.id,
      businessPartnerId: bpContext.businessPartner.id,
      franchiseId: bpContext.franchise.id,
      centerId: bpContext.center.id,
      recipientUserId: bpUser.id,
      severity: "HIGH",
      title: `Bulk high ${randomId("bulkhigh")}`,
      message: "bulk high event",
      triggeredAt: new Date("2026-05-10T12:00:00.000Z")
    });

    const warningEvent = await createOperationalEventForUser({
      tenantId: tenant.id,
      businessPartnerId: bpContext.businessPartner.id,
      franchiseId: bpContext.franchise.id,
      centerId: bpContext.center.id,
      recipientUserId: bpUser.id,
      severity: "WARNING",
      title: `Bulk warning ${randomId("bulkwarn")}`,
      message: "bulk warning event",
      triggeredAt: new Date("2026-05-10T13:00:00.000Z")
    });

    const markAllResponse = await http
      .patch(`/api/partner/notifications/operational/read-all?severity=HIGH`)
      .set(authHeader(bpToken));

    expect(markAllResponse.status).toBe(200);
    expect(markAllResponse.body.data.updatedCount).toBeGreaterThanOrEqual(1);

    const remainingUnread = await http
      .get(`/api/partner/notifications/operational?severity=WARNING&unread=true&franchiseId=${bpContext.franchise.id}`)
      .set(authHeader(bpToken));

    expect(remainingUnread.status).toBe(200);
    expect(remainingUnread.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notificationId: warningEvent.notification.id, severity: "WARNING", isUnread: true })
      ])
    );
  });
});