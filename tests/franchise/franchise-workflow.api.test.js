import { jest } from "@jest/globals";
import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import { createOrUpdateOperationalEvent } from "../../src/services/operational-notification.service.js";
import { synchronizeFranchiseOperationalWorkflows } from "../../src/services/franchise-workflow.service.js";

jest.setTimeout(120000);

async function createCenterForFranchise({ tenantId, franchiseId, suffix }) {
  const authUser = await prisma.authUser.create({
    data: {
      tenantId,
      username: `frwfce_${suffix}`,
      email: `frwfce.${suffix}@abacusweb.local`,
      passwordHash: "test-hash",
      role: "CENTER",
      isActive: true
    }
  });

  const center = await prisma.centerProfile.create({
    data: {
      tenantId,
      franchiseProfileId: franchiseId,
      authUserId: authUser.id,
      code: `WF-CE-${suffix}`,
      name: `Workflow Center ${suffix}`,
      displayName: `Workflow Center ${suffix}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    authUser,
    center
  };
}

async function createWorkflowNotification({
  tenantId,
  businessPartnerId,
  franchiseId,
  centerId,
  recipientUserId,
  title,
  fingerprintSuffix,
  triggeredAt,
  severity = "HIGH"
}) {
  return createOrUpdateOperationalEvent({
    tenantId,
    businessPartnerId,
    franchiseId,
    centerId,
    type: severity === "CRITICAL" ? "CRITICAL_ATTENDANCE" : "LOW_ATTENDANCE",
    category: "OPERATIONS",
    severity,
    title,
    message: `${title} requires franchise governance`,
    metricKey: "attendancePercent",
    thresholdValue: 75,
    observedValue: severity === "CRITICAL" ? 39 : 61,
    deltaPercent: severity === "CRITICAL" ? -28 : -14,
    sourceKind: "SNAPSHOT",
    sourceSnapshotDate: triggeredAt,
    sourceWindowKey: `window:${fingerprintSuffix}`,
    fingerprint: `frwf:${fingerprintSuffix}`,
    activeFingerprint: `frwf-active:${fingerprintSuffix}`,
    triggeredAt,
    deepLinkPath: `/franchise/workflows`,
    targets: [
      {
        recipientUserId,
        recipientRole: "FRANCHISE",
        targetKey: `user:${recipientUserId}`,
        franchiseId,
        centerId
      }
    ]
  });
}

describe("FRANCHISE WORKFLOW APIs", () => {
  let tenant;
  let hierarchyNode;
  let ownFranchiseUser;
  let foreignFranchiseUser;
  let ownFranchise;
  let foreignFranchise;
  let ownToken;
  let foreignToken;
  let ownCenterContext;
  let foreignCenterContext;
  const workflowIds = [];
  const notificationIds = [];
  const notificationFingerprints = [];
  const centerIds = [];
  const centerUserIds = [];

  beforeAll(async () => {
    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    hierarchyNode = await prisma.hierarchyNode.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        isActive: true
      },
      orderBy: { createdAt: "asc" }
    });

    ownFranchiseUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `frwf.${randomId("owner")}@abacusweb.local`,
      username: randomId("frwfown"),
      role: "FRANCHISE",
      hierarchyNodeCode: hierarchyNode.code
    });

    foreignFranchiseUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `frwf.${randomId("foreign")}@abacusweb.local`,
      username: randomId("frwffor"),
      role: "FRANCHISE",
      hierarchyNodeCode: hierarchyNode.code
    });

    ownFranchise = await prisma.franchiseProfile.findUniqueOrThrow({
      where: { authUserId: ownFranchiseUser.id }
    });

    foreignFranchise = await prisma.franchiseProfile.findUniqueOrThrow({
      where: { authUserId: foreignFranchiseUser.id }
    });

    ownCenterContext = await createCenterForFranchise({
      tenantId: tenant.id,
      franchiseId: ownFranchise.id,
      suffix: randomId("own")
    });
    foreignCenterContext = await createCenterForFranchise({
      tenantId: tenant.id,
      franchiseId: foreignFranchise.id,
      suffix: randomId("foreign")
    });

    centerIds.push(ownCenterContext.center.id, foreignCenterContext.center.id);
    centerUserIds.push(ownCenterContext.authUser.id, foreignCenterContext.authUser.id);

    const ownLogin = await loginAs({ email: ownFranchiseUser.email });
    const foreignLogin = await loginAs({ email: foreignFranchiseUser.email });
    ownToken = ownLogin.body.data.access_token;
    foreignToken = foreignLogin.body.data.access_token;

    const ownEvent = await createWorkflowNotification({
      tenantId: tenant.id,
      businessPartnerId: ownFranchise.businessPartnerId,
      franchiseId: ownFranchise.id,
      centerId: ownCenterContext.center.id,
      recipientUserId: ownFranchiseUser.id,
      title: `Own workflow ${randomId("ownwf")}`,
      fingerprintSuffix: randomId("ownfp"),
      triggeredAt: new Date("2026-05-12T10:00:00.000Z")
    });

    const foreignEvent = await createWorkflowNotification({
      tenantId: tenant.id,
      businessPartnerId: foreignFranchise.businessPartnerId,
      franchiseId: foreignFranchise.id,
      centerId: foreignCenterContext.center.id,
      recipientUserId: foreignFranchiseUser.id,
      title: `Foreign workflow ${randomId("foreignwf")}`,
      fingerprintSuffix: randomId("foreignfp"),
      triggeredAt: new Date("2026-05-12T11:00:00.000Z"),
      severity: "CRITICAL"
    });

    notificationIds.push(ownEvent.notification.id, foreignEvent.notification.id);
    notificationFingerprints.push(
      ownEvent.notification.activeFingerprint || ownEvent.notification.fingerprint,
      foreignEvent.notification.activeFingerprint || foreignEvent.notification.fingerprint
    );

    await synchronizeFranchiseOperationalWorkflows({
      tenantId: tenant.id,
      franchiseScope: {
        franchise: {
          id: ownFranchise.id,
          businessPartnerId: ownFranchise.businessPartnerId,
          authUserId: ownFranchise.authUserId
        }
      }
    });

    await synchronizeFranchiseOperationalWorkflows({
      tenantId: tenant.id,
      franchiseScope: {
        franchise: {
          id: foreignFranchise.id,
          businessPartnerId: foreignFranchise.businessPartnerId,
          authUserId: foreignFranchise.authUserId
        }
      }
    });

    const createdWorkflows = await prisma.franchiseOperationalWorkflow.findMany({
      where: {
        tenantId: tenant.id,
        notificationFingerprint: { in: notificationFingerprints }
      },
      select: { id: true }
    });

    workflowIds.push(...createdWorkflows.map((workflow) => workflow.id));
  });

  afterAll(async () => {
    if (workflowIds.length) {
      await prisma.franchiseOperationalEscalation.deleteMany({ where: { workflowId: { in: workflowIds } } });
      await prisma.franchiseOperationalWorkflowTask.deleteMany({ where: { workflowId: { in: workflowIds } } });
      await prisma.franchiseOperationalWorkflowHistory.deleteMany({ where: { workflowId: { in: workflowIds } } });
      await prisma.franchiseOperationalWorkflow.deleteMany({ where: { id: { in: workflowIds } } });
    }

    if (notificationIds.length) {
      await prisma.operationalNotificationTarget.deleteMany({ where: { notificationId: { in: notificationIds } } });
      await prisma.operationalNotification.deleteMany({ where: { id: { in: notificationIds } } });
    }

    if (centerIds.length) {
      await prisma.centerProfile.deleteMany({ where: { id: { in: centerIds } } });
    }

    if (centerUserIds.length) {
      await prisma.authUser.deleteMany({ where: { id: { in: centerUserIds } } });
    }

    await prisma.franchiseProfile.deleteMany({ where: { id: { in: [ownFranchise?.id, foreignFranchise?.id].filter(Boolean) } } });
    await prisma.authUser.deleteMany({ where: { id: { in: [ownFranchiseUser?.id, foreignFranchiseUser?.id].filter(Boolean) } } });
  });

  test("lists franchise workflow queues with franchise-safe isolation and summary counts", async () => {
    const response = await http
      .get("/api/franchise/workflows/queues?limit=10&offset=0&sortBy=lastTriggeredAt&sortOrder=desc")
      .set(authHeader(ownToken));

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      centerId: ownCenterContext.center.id,
      centerCode: ownCenterContext.center.code,
      severity: "HIGH",
      status: "OPEN",
      queueType: "REVIEW"
    });
    expect(response.body.data.items.some((item) => item.centerId === foreignCenterContext.center.id)).toBe(false);
    expect(response.body.data.summary.reviewQueueCount).toBeGreaterThanOrEqual(1);
    expect(response.body.data.summary.escalationQueueCount).toBe(0);
  });

  test("reviews a workflow through the API and returns immutable history on detail endpoints", async () => {
    const workflow = await prisma.franchiseOperationalWorkflow.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        franchiseId: ownFranchise.id,
        centerId: ownCenterContext.center.id
      },
      orderBy: { createdAt: "asc" }
    });

    const reviewResponse = await http
      .post(`/api/franchise/workflows/${workflow.id}/actions/review`)
      .set(authHeader(ownToken))
      .send({
        expectedVersion: workflow.workflowVersion,
        notes: "Reviewed from franchise queue"
      });

    expect(reviewResponse.status).toBe(200);
    expect(reviewResponse.body.data.workflow.status).toBe("REVIEWED");
    expect(reviewResponse.body.data.workflow.workflowVersion).toBe(workflow.workflowVersion + 1);
    expect(reviewResponse.body.data.lastHistory.actionType).toBe("REVIEW");

    const detailResponse = await http
      .get(`/api/franchise/workflows/${workflow.id}`)
      .set(authHeader(ownToken));

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.workflow.allowedActions).toContain("ACKNOWLEDGE");
    expect(detailResponse.body.data.history.map((item) => item.actionType)).toEqual(["OPEN", "REVIEW"]);

    const historyResponse = await http
      .get(`/api/franchise/workflows/${workflow.id}/history?limit=10&offset=0`)
      .set(authHeader(ownToken));

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.data.total).toBe(2);
    expect(historyResponse.body.data.items[0].actionType).toBe("REVIEW");
    expect(historyResponse.body.data.items[1].actionType).toBe("OPEN");
  });

  test("rejects stale workflow versions with deterministic 409 conflicts", async () => {
    const workflow = await prisma.franchiseOperationalWorkflow.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        franchiseId: ownFranchise.id,
        centerId: ownCenterContext.center.id
      },
      orderBy: { createdAt: "asc" }
    });

    const response = await http
      .post(`/api/franchise/workflows/${workflow.id}/actions/acknowledge`)
      .set(authHeader(ownToken))
      .send({
        expectedVersion: 1,
        notes: "Stale acknowledge"
      });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("WORKFLOW_VERSION_CONFLICT");
  });

  test("prevents cross-franchise workflow mutations inside the same tenant", async () => {
    const foreignWorkflow = await prisma.franchiseOperationalWorkflow.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        franchiseId: foreignFranchise.id,
        centerId: foreignCenterContext.center.id
      },
      orderBy: { createdAt: "asc" }
    });

    const response = await http
      .post(`/api/franchise/workflows/${foreignWorkflow.id}/actions/review`)
      .set(authHeader(ownToken))
      .send({
        expectedVersion: foreignWorkflow.workflowVersion,
        notes: "Attempt foreign workflow review"
      });

    expect(response.status).toBe(404);
    expect(response.body.error_code).toBe("WORKFLOW_NOT_FOUND");

    const storedWorkflow = await prisma.franchiseOperationalWorkflow.findUniqueOrThrow({
      where: { id: foreignWorkflow.id },
      select: {
        status: true,
        workflowVersion: true
      }
    });

    expect(storedWorkflow.status).toBe("OPEN");
    expect(storedWorkflow.workflowVersion).toBe(foreignWorkflow.workflowVersion);
  });
});