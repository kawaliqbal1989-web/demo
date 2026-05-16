import { jest } from "@jest/globals";
import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";
import {
  addSettlementSupportingRecord,
  escalateSettlement,
  markSettlementReviewed,
  submitSettlementForReview
} from "../../src/services/settlement-workflow.service.js";

jest.setTimeout(120000);

async function createScopedPartnerWorkflowContext() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  const bpUser = await prisma.authUser.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      role: "BP",
      email: "bp.manager@abacusweb.local"
    }
  });
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

  const franchiseUser = await ensureAuthUser({
    tenantCode: "DEFAULT",
    email: `${randomId("bpwf-fr")}@abacusweb.local`,
    role: "FRANCHISE"
  });
  const franchise = await prisma.franchiseProfile.update({
    where: { authUserId: franchiseUser.id },
    data: {
      businessPartnerId: businessPartner.id,
      status: "ACTIVE",
      isActive: true
    }
  });

  const centerUser = await ensureAuthUser({
    tenantCode: "DEFAULT",
    email: `${randomId("bpwf-ce")}@abacusweb.local`,
    role: "CENTER"
  });
  const center = await prisma.centerProfile.update({
    where: { authUserId: centerUser.id },
    data: {
      franchiseProfileId: franchise.id,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    tenant,
    bpUser,
    businessPartner,
    superadminUser,
    franchiseUser,
    franchise,
    centerUser,
    center
  };
}

async function createForeignPartnerContext(tenant, createdByUserId) {
  const businessPartner = await prisma.businessPartner.create({
    data: {
      tenantId: tenant.id,
      name: `Foreign Workflow Partner ${randomId("bpwf-foreign")}`,
      code: `FWP-${randomId("bpwf-code")}`,
      displayName: `Foreign Workflow Partner ${randomId("bpwf-disp")}`,
      status: "ACTIVE",
      isActive: true,
      contactEmail: `${randomId("bpwf-foreign-mail")}@abacusweb.local`,
      createdByUserId,
      subscriptionStatus: "ACTIVE"
    }
  });

  return { businessPartner };
}

async function createSettlement({ tenantId, businessPartnerId, month, status = "DRAFT", currentActionRole = null }) {
  return prisma.settlement.create({
    data: {
      tenantId,
      businessPartnerId,
      periodYear: 2099,
      periodMonth: month,
      periodStart: new Date(Date.UTC(2099, month - 1, 1, 0, 0, 0, 0)),
      periodEnd: new Date(Date.UTC(2099, month, 1, 0, 0, 0, 0) - 1),
      grossAmount: 8000,
      partnerEarnings: 6500,
      platformEarnings: 1500,
      status,
      currentActionRole
    }
  });
}

async function progressSettlementToReviewed(context, settlement) {
  await submitSettlementForReview({
    tenantId: context.tenant.id,
    settlementId: settlement.id,
    actorUserId: context.centerUser.id,
    actorRole: "CENTER",
    expectedVersion: 1,
    notes: "Submitted for franchise review"
  });

  return markSettlementReviewed({
    tenantId: context.tenant.id,
    settlementId: settlement.id,
    actorUserId: context.franchiseUser.id,
    actorRole: "FRANCHISE",
    expectedVersion: 2,
    notes: "Franchise completed review"
  });
}

describe("PARTNER SETTLEMENT WORKFLOW APIs", () => {
  let bpToken;
  let context;
  let foreignContext;
  const settlementIds = [];

  beforeAll(async () => {
    const login = await loginAs({ email: "bp.manager@abacusweb.local" });
    bpToken = login.body.data.access_token;
    context = await createScopedPartnerWorkflowContext();
    foreignContext = await createForeignPartnerContext(context.tenant, context.superadminUser.id);
  });

  afterAll(async () => {
    if (settlementIds.length) {
      await prisma.settlementSupportingRecord.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.settlementEscalation.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.settlementWorkflowTask.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.settlementWorkflowHistory.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.financialTransaction.updateMany({ where: { settlementId: { in: settlementIds } }, data: { settlementId: null } });
      await prisma.settlement.deleteMany({ where: { id: { in: settlementIds } } });
    }

    await prisma.centerProfile.deleteMany({ where: { id: context.center.id } });
    await prisma.franchiseProfile.deleteMany({ where: { id: context.franchise.id } });
    await prisma.authUser.deleteMany({ where: { id: { in: [context.centerUser.id, context.franchiseUser.id] } } });
    await prisma.businessPartner.deleteMany({ where: { id: foreignContext.businessPartner.id } });
  });

  test("delivers a scoped workflow queue with pagination, summary counts, and foreign settlement exclusion", async () => {
    const ownReviewed = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 1,
      status: "REVIEWED",
      currentActionRole: "BP"
    });
    const ownPending = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 2,
      status: "PENDING_REVIEW",
      currentActionRole: "FRANCHISE"
    });
    const ownApproved = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 3,
      status: "APPROVED",
      currentActionRole: "SUPERADMIN"
    });
    const foreignReviewed = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: foreignContext.businessPartner.id,
      month: 4,
      status: "REVIEWED",
      currentActionRole: "BP"
    });

    settlementIds.push(ownReviewed.id, ownPending.id, ownApproved.id, foreignReviewed.id);

    await prisma.settlement.update({
      where: { id: ownApproved.id },
      data: { payoutDueAt: new Date("2000-01-01T00:00:00.000Z") }
    });

    const listResponse = await http
      .get("/api/partner/workflows/settlements?pendingActionOnly=true&sortBy=updatedAt&sortOrder=desc&limit=10&offset=0")
      .set(authHeader(bpToken));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.total).toBeGreaterThanOrEqual(1);
    expect(listResponse.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ownReviewed.id,
          businessPartnerId: context.businessPartner.id,
          status: "REVIEWED",
          currentActionRole: "BP"
        })
      ])
    );
    expect(listResponse.body.data.items.some((item) => item.id === foreignReviewed.id)).toBe(false);

    const summaryResponse = await http
      .get("/api/partner/workflows/settlements/queue/summary")
      .set(authHeader(bpToken));

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.data.pendingReviewCount).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.data.approvalQueueCount).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.data.overdueCount).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.data.payoutPendingCount).toBeGreaterThanOrEqual(1);
  });

  test("returns scoped workflow detail, immutable history, active tasks, escalations, and supporting records", async () => {
    const settlement = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 5
    });
    settlementIds.push(settlement.id);

    await progressSettlementToReviewed(context, settlement);
    await addSettlementSupportingRecord({
      tenantId: context.tenant.id,
      settlementId: settlement.id,
      actorUserId: context.centerUser.id,
      actorRole: "CENTER",
      recordType: "CENTER_REVENUE_SHEET",
      fileUrl: "https://files.example.local/revenue-sheet.csv",
      fileName: "revenue-sheet.csv",
      mimeType: "text/csv",
      notes: "Revenue evidence",
      centerId: context.center.id
    });
    const escalated = await escalateSettlement({
      tenantId: context.tenant.id,
      settlementId: settlement.id,
      actorUserId: context.bpUser.id,
      actorRole: "BP",
      expectedVersion: 3,
      escalationType: "UNAPPROVED_SETTLEMENT",
      severity: "HIGH",
      reason: "Manual escalation for workflow visibility",
      notes: "Escalated by BP",
      franchiseId: context.franchise.id
    });

    const detailResponse = await http
      .get(`/api/partner/workflows/settlements/${settlement.id}`)
      .set(authHeader(bpToken));

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.data.settlement.id).toBe(settlement.id);
    expect(detailResponse.body.data.workflow.workflowVersion).toBe(4);
    expect(detailResponse.body.data.workflow.allowedActions).toContain("RESOLVE");
    expect(detailResponse.body.data.history.map((item) => item.actionType)).toEqual(["SUBMIT", "REVIEW", "ESCALATE"]);
    expect(detailResponse.body.data.escalations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: escalated.escalation.id,
          escalationType: "UNAPPROVED_SETTLEMENT",
          state: "ACTIVE"
        })
      ])
    );
    expect(detailResponse.body.data.supportingRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "CENTER_REVENUE_SHEET",
          uploadedByRole: "CENTER"
        })
      ])
    );

    const historyResponse = await http
      .get(`/api/partner/workflows/settlements/${settlement.id}/history?limit=10&offset=0`)
      .set(authHeader(bpToken));

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.data.items).toHaveLength(3);

    const escalationResponse = await http
      .get(`/api/partner/workflows/settlements/${settlement.id}/escalations`)
      .set(authHeader(bpToken));

    expect(escalationResponse.status).toBe(200);
    expect(escalationResponse.body.data.items[0].id).toBe(escalated.escalation.id);
  });

  test("approves reviewed settlements through optimistic concurrency-safe BP action endpoints", async () => {
    const settlement = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 6
    });
    settlementIds.push(settlement.id);

    await progressSettlementToReviewed(context, settlement);

    const approveResponse = await http
      .post(`/api/partner/workflows/settlements/${settlement.id}/actions/approve`)
      .set(authHeader(bpToken))
      .send({
        expectedVersion: 3,
        notes: "Approved from BP queue",
        payoutDueAt: "2099-06-15T00:00:00.000Z"
      });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.data.settlement.status).toBe("APPROVED");
    expect(approveResponse.body.data.workflowVersion).toBe(4);
    expect(approveResponse.body.data.history.actionType).toBe("APPROVE");
  });

  test("returns 409 conflicts for stale workflow versions and invalid BP transitions", async () => {
    const reviewedSettlement = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 7,
      status: "REVIEWED",
      currentActionRole: "BP"
    });
    const draftSettlement = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 8,
      status: "DRAFT"
    });
    settlementIds.push(reviewedSettlement.id, draftSettlement.id);

    const staleResponse = await http
      .post(`/api/partner/workflows/settlements/${reviewedSettlement.id}/actions/approve`)
      .set(authHeader(bpToken))
      .send({
        expectedVersion: 99,
        notes: "Stale version"
      });

    expect(staleResponse.status).toBe(409);
    expect(staleResponse.body.error_code).toBe("WORKFLOW_VERSION_CONFLICT");

    const invalidResponse = await http
      .post(`/api/partner/workflows/settlements/${draftSettlement.id}/actions/approve`)
      .set(authHeader(bpToken))
      .send({
        expectedVersion: 1,
        notes: "Invalid approval"
      });

    expect(invalidResponse.status).toBe(409);
    expect(invalidResponse.body.error_code).toBe("INVALID_TRANSITION");
  });

  test("prevents foreign workflow detail access and foreign audit visibility", async () => {
    const foreignSettlement = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: foreignContext.businessPartner.id,
      month: 9,
      status: "REVIEWED",
      currentActionRole: "BP"
    });
    settlementIds.push(foreignSettlement.id);

    const response = await http
      .get(`/api/partner/workflows/settlements/${foreignSettlement.id}`)
      .set(authHeader(bpToken));

    expect(response.status).toBe(404);
    expect(response.body.error_code).toBe("SETTLEMENT_NOT_FOUND");
  });

  test("keeps supporting-record creation role-safe on BP routes while still listing scoped evidence", async () => {
    const settlement = await createSettlement({
      tenantId: context.tenant.id,
      businessPartnerId: context.businessPartner.id,
      month: 10,
      status: "REVIEWED",
      currentActionRole: "BP"
    });
    settlementIds.push(settlement.id);

    const createResponse = await http
      .post(`/api/partner/workflows/settlements/${settlement.id}/supporting-records`)
      .set(authHeader(bpToken))
      .send({
        recordType: "BP_NOTE",
        fileUrl: "https://files.example.local/bp-note.txt",
        fileName: "bp-note.txt"
      });

    expect(createResponse.status).toBe(403);
    expect(createResponse.body.error_code).toBe("WORKFLOW_PERMISSION_DENIED");

    const listResponse = await http
      .get(`/api/partner/workflows/settlements/${settlement.id}/supporting-records`)
      .set(authHeader(bpToken));

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.data.items)).toBe(true);
  });
});