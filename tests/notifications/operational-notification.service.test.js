import {
  cleanupOperationalNotifications,
  createOrUpdateOperationalEvent,
  getOperationalUnreadCounts,
  listOperationalNotifications,
  markAllOperationalNotificationsRead,
  markOperationalNotificationRead
} from "../../src/services/operational-notification.service.js";
import { prisma, randomId } from "../helpers/test-helpers.js";

function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 23).replace("T", " ");
}

async function createAuthUser({ tenantId, role, prefix = "opsuser" }) {
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

async function createScopeContextForTenant(tenant) {
  const creator = await prisma.authUser.findFirst({
    where: {
      tenantId: tenant.id,
      role: "SUPERADMIN",
      isActive: true
    },
    orderBy: { createdAt: "asc" }
  }) || await createAuthUser({ tenantId: tenant.id, role: "SUPERADMIN", prefix: "opssa" });

  const franchiseUser = await createAuthUser({ tenantId: tenant.id, role: "FRANCHISE", prefix: "opsfr" });
  const centerUser = await createAuthUser({ tenantId: tenant.id, role: "CENTER", prefix: "opsce" });

  const businessPartner = await prisma.businessPartner.create({
    data: {
      tenantId: tenant.id,
      name: `Ops Partner ${randomId("bp")}`,
      code: `BP-${randomId("bp")}`,
      displayName: `Ops Partner ${randomId("bpdisp")}`,
      status: "ACTIVE",
      isActive: true,
      createdByUserId: creator.id,
      subscriptionStatus: "ACTIVE"
    }
  });

  const franchise = await prisma.franchiseProfile.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: businessPartner.id,
      authUserId: franchiseUser.id,
      code: `FR-${randomId("fr")}`,
      name: `Ops Franchise ${randomId("frname")}`,
      displayName: `Ops Franchise ${randomId("frdisp")}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  const center = await prisma.centerProfile.create({
    data: {
      tenantId: tenant.id,
      franchiseProfileId: franchise.id,
      authUserId: centerUser.id,
      code: `CE-${randomId("ce")}`,
      name: `Ops Center ${randomId("cename")}`,
      displayName: `Ops Center ${randomId("cedisp")}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    tenant,
    creator,
    businessPartner,
    franchise,
    center
  };
}

async function createDefaultScopeContext() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { code: "DEFAULT" }
  });

  return createScopeContextForTenant(tenant);
}

async function createIsolatedScopeContext() {
  const suffix = randomId("opstenant");
  const tenant = await prisma.tenant.create({
    data: {
      name: `Operational Tenant ${suffix}`,
      code: `OPS_${suffix}`
    }
  });

  return createScopeContextForTenant(tenant);
}

function buildOperationalPayload({
  context,
  targets,
  fingerprint = randomId("opnfp"),
  severity = "WARNING",
  category = "OPERATIONS",
  title = `Operational alert ${randomId("title")}`,
  message = `Operational message ${randomId("msg")}`,
  triggeredAt = new Date(),
  cooldownUntil = null,
  observedValue = 45,
  deltaPercent = -10,
  metricKey = "attendancePercent",
  expiresAt = null,
  sourceKind = "SNAPSHOT"
} = {}) {
  return {
    tenantId: context.tenant.id,
    businessPartnerId: context.businessPartner.id,
    franchiseId: context.franchise.id,
    centerId: context.center.id,
    type: "LOW_ATTENDANCE",
    category,
    severity,
    title,
    message,
    metricKey,
    thresholdValue: 75,
    observedValue,
    deltaPercent,
    sourceKind,
    sourceSnapshotDate: triggeredAt,
    sourceWindowKey: randomId("window"),
    fingerprint,
    activeFingerprint: fingerprint,
    cooldownUntil,
    triggeredAt,
    expiresAt,
    deepLinkPath: `/partner/franchises/${context.franchise.id}`,
    metadata: {
      testRun: fingerprint
    },
    targets: targets.map((target, index) => ({
      recipientUserId: target.id,
      recipientRole: target.role,
      targetKey: `${target.id}:${index}`
    }))
  };
}

describe("OPERATIONAL NOTIFICATION SERVICE", () => {
  let defaultContext;
  let isolatedContext;

  beforeAll(async () => {
    defaultContext = await createDefaultScopeContext();
    isolatedContext = await createIsolatedScopeContext();
  });

  test("activeFingerprint dedupe prevents duplicate active events during concurrent scheduler retries", async () => {
    const recipient = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opsdedupe" });
    const fingerprint = randomId("dedupefp");
    const payload = buildOperationalPayload({
      context: defaultContext,
      fingerprint,
      targets: [recipient],
      cooldownUntil: new Date(Date.now() + 10 * 60 * 1000)
    });

    await Promise.all([
      createOrUpdateOperationalEvent(payload),
      createOrUpdateOperationalEvent(payload),
      createOrUpdateOperationalEvent(payload)
    ]);

    const notifications = await prisma.operationalNotification.findMany({
      where: {
        tenantId: defaultContext.tenant.id,
        activeFingerprint: fingerprint
      }
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].occurrenceCount).toBe(3);

    const targetCount = await prisma.operationalNotificationTarget.count({
      where: {
        tenantId: defaultContext.tenant.id,
        notificationId: notifications[0].id
      }
    });

    expect(targetCount).toBe(1);
  });

  test("cooldown suppression updates the event without reopening already read targets", async () => {
    const recipient = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opscool" });
    const fingerprint = randomId("cooldownfp");
    const initial = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint,
        targets: [recipient],
        severity: "WARNING",
        cooldownUntil: new Date(Date.now() + 30 * 60 * 1000),
        observedValue: 55,
        deltaPercent: -8
      })
    );

    await markOperationalNotificationRead({
      tenantId: defaultContext.tenant.id,
      notificationId: initial.notification.id,
      recipientUserId: recipient.id
    });

    const retriggered = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint,
        targets: [recipient],
        severity: "WARNING",
        cooldownUntil: new Date(Date.now() + 30 * 60 * 1000),
        observedValue: 42,
        deltaPercent: -18,
        message: "Retrigger during cooldown"
      })
    );

    expect(retriggered.created).toBe(false);
    expect(retriggered.suppressed).toBe(true);
    expect(retriggered.escalated).toBe(false);

    const target = await prisma.operationalNotificationTarget.findFirstOrThrow({
      where: {
        tenantId: defaultContext.tenant.id,
        notificationId: initial.notification.id,
        recipientUserId: recipient.id
      }
    });

    expect(target.readAt).not.toBeNull();
    expect(target.reopenedAt).toBeNull();

    const event = await prisma.operationalNotification.findUniqueOrThrow({
      where: { id: initial.notification.id }
    });

    expect(event.occurrenceCount).toBe(2);
    expect(event.observedValue).toBe(42);
    expect(event.deltaPercent).toBe(-18);
  });

  test("severity escalation reopens previously read targets", async () => {
    const recipient = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opsesc" });
    const fingerprint = randomId("escalationfp");
    const created = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint,
        targets: [recipient],
        severity: "WARNING",
        cooldownUntil: new Date(Date.now() + 30 * 60 * 1000)
      })
    );

    await markOperationalNotificationRead({
      tenantId: defaultContext.tenant.id,
      notificationId: created.notification.id,
      recipientUserId: recipient.id
    });

    const escalated = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint,
        targets: [recipient],
        severity: "CRITICAL",
        cooldownUntil: new Date(Date.now() + 30 * 60 * 1000),
        observedValue: 31,
        deltaPercent: -25
      })
    );

    expect(escalated.created).toBe(false);
    expect(escalated.escalated).toBe(true);
    expect(escalated.suppressed).toBe(false);

    const target = await prisma.operationalNotificationTarget.findFirstOrThrow({
      where: {
        tenantId: defaultContext.tenant.id,
        notificationId: created.notification.id,
        recipientUserId: recipient.id
      }
    });

    expect(target.readAt).toBeNull();
    expect(target.reopenedAt).not.toBeNull();

    const event = await prisma.operationalNotification.findUniqueOrThrow({
      where: { id: created.notification.id }
    });

    expect(event.severity).toBe("CRITICAL");
    expect(event.occurrenceCount).toBe(2);
  });

  test("unread counts and mark-all-read stay isolated per recipient", async () => {
    const recipientA = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opscounta" });
    const recipientB = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opscountb" });

    const eventA1 = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("counta1"),
        targets: [recipientA],
        severity: "CRITICAL"
      })
    );
    const eventA2 = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("counta2"),
        targets: [recipientA],
        severity: "HIGH",
        category: "FINANCE"
      })
    );
    const eventB = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("countb1"),
        targets: [recipientB],
        severity: "HIGH"
      })
    );

    expect(eventA1.notification.id).toBeTruthy();
    expect(eventA2.notification.id).toBeTruthy();
    expect(eventB.notification.id).toBeTruthy();

    const beforeA = await getOperationalUnreadCounts({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipientA.id,
      includeGroups: true
    });
    const beforeB = await getOperationalUnreadCounts({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipientB.id
    });

    expect(beforeA.totalUnread).toBe(2);
    expect(beforeA.criticalUnread).toBe(1);
    expect(beforeA.highUnread).toBe(1);
    expect(beforeA.grouped.byCategory.FINANCE).toBe(1);
    expect(beforeB.totalUnread).toBe(1);

    const markAllResult = await markAllOperationalNotificationsRead({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipientA.id
    });

    expect(markAllResult.updatedCount).toBe(2);

    const afterA = await getOperationalUnreadCounts({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipientA.id
    });
    const afterB = await getOperationalUnreadCounts({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipientB.id
    });

    expect(afterA.totalUnread).toBe(0);
    expect(afterB.totalUnread).toBe(1);
  });

  test("paginated listing applies filters with stable ordering", async () => {
    const recipient = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opslist" });
    const baseTime = Date.now();

    const newest = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("list1"),
        targets: [recipient],
        severity: "CRITICAL",
        category: "FINANCE",
        triggeredAt: new Date(baseTime + 3000)
      })
    );
    const middle = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("list2"),
        targets: [recipient],
        severity: "CRITICAL",
        category: "FINANCE",
        triggeredAt: new Date(baseTime + 2000)
      })
    );
    const oldest = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("list3"),
        targets: [recipient],
        severity: "CRITICAL",
        category: "FINANCE",
        triggeredAt: new Date(baseTime + 1000)
      })
    );
    await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("list4"),
        targets: [recipient],
        severity: "HIGH",
        category: "OPERATIONS",
        triggeredAt: new Date(baseTime + 4000)
      })
    );

    const pageOne = await listOperationalNotifications({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipient.id,
      filters: {
        severity: "CRITICAL",
        category: "FINANCE",
        franchiseId: defaultContext.franchise.id,
        centerId: defaultContext.center.id,
        limit: 2,
        page: 1,
        sortBy: "lastTriggeredAt",
        sortOrder: "desc"
      }
    });

    const pageTwo = await listOperationalNotifications({
      tenantId: defaultContext.tenant.id,
      recipientUserId: recipient.id,
      filters: {
        severity: "CRITICAL",
        category: "FINANCE",
        franchiseId: defaultContext.franchise.id,
        centerId: defaultContext.center.id,
        limit: 2,
        page: 2,
        sortBy: "lastTriggeredAt",
        sortOrder: "desc"
      }
    });

    expect(pageOne.total).toBe(3);
    expect(pageOne.items.map((item) => item.notificationId)).toEqual([
      newest.notification.id,
      middle.notification.id
    ]);
    expect(pageTwo.items.map((item) => item.notificationId)).toEqual([oldest.notification.id]);
  });

  test("cleanup expires stale active events and deletes only old resolved read history", async () => {
    const recipient = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opscleanup" });
    const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

    const resolved = await prisma.operationalNotification.create({
      data: {
        tenantId: defaultContext.tenant.id,
        businessPartnerId: defaultContext.businessPartner.id,
        franchiseId: defaultContext.franchise.id,
        centerId: defaultContext.center.id,
        type: "LOW_ATTENDANCE",
        category: "OPERATIONS",
        severity: "HIGH",
        status: "RESOLVED",
        title: "Old resolved event",
        message: "Old resolved event",
        sourceKind: "SNAPSHOT",
        fingerprint: randomId("resolvedfp"),
        activeFingerprint: null,
        firstTriggeredAt: staleDate,
        lastTriggeredAt: staleDate,
        resolvedAt: staleDate,
        occurrenceCount: 1
      }
    });

    await prisma.operationalNotificationTarget.create({
      data: {
        tenantId: defaultContext.tenant.id,
        notificationId: resolved.id,
        recipientUserId: recipient.id,
        recipientRole: recipient.role,
        targetKey: `${recipient.id}:resolved`,
        readAt: staleDate,
        deliveredAt: staleDate,
        lastSeenAt: staleDate
      }
    });

    await prisma.$executeRawUnsafe(
      "UPDATE operationalnotification SET updatedAt = ? WHERE id = ?",
      toMysqlDateTime(staleDate),
      resolved.id
    );

    const expiredUnread = await prisma.operationalNotification.create({
      data: {
        tenantId: defaultContext.tenant.id,
        businessPartnerId: defaultContext.businessPartner.id,
        franchiseId: defaultContext.franchise.id,
        centerId: defaultContext.center.id,
        type: "LOW_ATTENDANCE",
        category: "OPERATIONS",
        severity: "CRITICAL",
        status: "ACTIVE",
        title: "Expired unread event",
        message: "Expired unread event",
        sourceKind: "SNAPSHOT",
        fingerprint: randomId("expiredunread"),
        activeFingerprint: randomId("expiredactive"),
        firstTriggeredAt: staleDate,
        lastTriggeredAt: staleDate,
        expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        occurrenceCount: 1
      }
    });

    await prisma.operationalNotificationTarget.create({
      data: {
        tenantId: defaultContext.tenant.id,
        notificationId: expiredUnread.id,
        recipientUserId: recipient.id,
        recipientRole: recipient.role,
        targetKey: `${recipient.id}:expiredUnread`,
        deliveredAt: staleDate
      }
    });

    const activeUnread = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: randomId("activeunread"),
        targets: [recipient],
        severity: "HIGH",
        triggeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      })
    );

    const cleanupResult = await cleanupOperationalNotifications({
      tenantId: defaultContext.tenant.id,
      expiredRetentionDays: 1,
      resolvedRetentionDays: 30,
      batchSize: 50
    });

    expect(cleanupResult.expiredCount).toBeGreaterThanOrEqual(1);
    expect(cleanupResult.deletedCount).toBeGreaterThanOrEqual(1);

    const deletedResolved = await prisma.operationalNotification.findUnique({
      where: { id: resolved.id }
    });
    const preservedExpiredUnread = await prisma.operationalNotification.findUniqueOrThrow({
      where: { id: expiredUnread.id }
    });
    const preservedActiveUnread = await prisma.operationalNotification.findUniqueOrThrow({
      where: { id: activeUnread.notification.id }
    });

    expect(deletedResolved).toBeNull();
    expect(preservedExpiredUnread.status).toBe("EXPIRED");
    expect(preservedExpiredUnread.activeFingerprint).toBeNull();
    expect(preservedActiveUnread.status).toBe("ACTIVE");
  });

  test("tenant scoping keeps dedupe and reads isolated across tenants", async () => {
    const defaultRecipient = await createAuthUser({ tenantId: defaultContext.tenant.id, role: "TEACHER", prefix: "opstenantd" });
    const isolatedRecipient = await createAuthUser({ tenantId: isolatedContext.tenant.id, role: "TEACHER", prefix: "opstenanti" });
    const sharedFingerprint = randomId("sharedfp");

    const defaultEvent = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: defaultContext,
        fingerprint: sharedFingerprint,
        targets: [defaultRecipient]
      })
    );
    const isolatedEvent = await createOrUpdateOperationalEvent(
      buildOperationalPayload({
        context: isolatedContext,
        fingerprint: sharedFingerprint,
        targets: [isolatedRecipient]
      })
    );

    expect(defaultEvent.notification.id).not.toBe(isolatedEvent.notification.id);

    const defaultCounts = await getOperationalUnreadCounts({
      tenantId: defaultContext.tenant.id,
      recipientUserId: defaultRecipient.id
    });
    const isolatedCounts = await getOperationalUnreadCounts({
      tenantId: isolatedContext.tenant.id,
      recipientUserId: isolatedRecipient.id
    });

    expect(defaultCounts.totalUnread).toBe(1);
    expect(isolatedCounts.totalUnread).toBe(1);

    const defaultList = await listOperationalNotifications({
      tenantId: defaultContext.tenant.id,
      recipientUserId: defaultRecipient.id
    });
    const isolatedList = await listOperationalNotifications({
      tenantId: isolatedContext.tenant.id,
      recipientUserId: isolatedRecipient.id
    });

    expect(defaultList.items).toHaveLength(1);
    expect(isolatedList.items).toHaveLength(1);
    expect(defaultList.items[0].notificationId).toBe(defaultEvent.notification.id);
    expect(isolatedList.items[0].notificationId).toBe(isolatedEvent.notification.id);
  });
});