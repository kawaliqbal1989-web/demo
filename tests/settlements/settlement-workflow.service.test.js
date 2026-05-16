import { jest } from "@jest/globals";
import {
  addSettlementSupportingRecord,
  approveSettlement,
  escalateSettlement,
  markSettlementPaid,
  markSettlementReviewed,
  rejectSettlement,
  reopenSettlement,
  resolveSettlementEscalation,
  submitSettlementForReview
} from "../../src/services/settlement-workflow.service.js";
import { ensureAuthUser, prisma, randomId } from "../helpers/test-helpers.js";

jest.setTimeout(120000);

async function createScopedWorkflowFixture() {
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

  const bpPartner = await prisma.businessPartner.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      contactEmail: String(bpUser.email || "").toLowerCase()
    },
    orderBy: { createdAt: "desc" }
  });

  const franchiseUser = await ensureAuthUser({
    tenantCode: "DEFAULT",
    email: `${randomId("wf-franchise")}@abacusweb.local`,
    role: "FRANCHISE"
  });

  const franchiseProfile = await prisma.franchiseProfile.update({
    where: { authUserId: franchiseUser.id },
    data: {
      businessPartnerId: bpPartner.id,
      status: "ACTIVE",
      isActive: true
    }
  });

  const centerUser = await ensureAuthUser({
    tenantCode: "DEFAULT",
    email: `${randomId("wf-center")}@abacusweb.local`,
    role: "CENTER"
  });

  const centerProfile = await prisma.centerProfile.update({
    where: { authUserId: centerUser.id },
    data: {
      franchiseProfileId: franchiseProfile.id,
      status: "ACTIVE",
      isActive: true
    }
  });

  return {
    tenant,
    bpUser,
    bpPartner,
    superadminUser,
    franchiseUser,
    franchiseProfile,
    centerUser,
    centerProfile
  };
}

async function createSettlement({ tenantId, businessPartnerId, status = "DRAFT", currentActionRole = null, month }) {
  return prisma.settlement.create({
    data: {
      tenantId,
      businessPartnerId,
      periodYear: 2099,
      periodMonth: month,
      periodStart: new Date(Date.UTC(2099, month - 1, 1, 0, 0, 0, 0)),
      periodEnd: new Date(Date.UTC(2099, month, 1, 0, 0, 0, 0) - 1),
      grossAmount: 5000,
      partnerEarnings: 4000,
      platformEarnings: 1000,
      status,
      currentActionRole
    }
  });
}

describe("SETTLEMENT WORKFLOW SERVICE", () => {
  let fixture;
  const settlementIds = [];

  beforeAll(async () => {
    fixture = await createScopedWorkflowFixture();
  });

  afterAll(async () => {
    if (settlementIds.length) {
      await prisma.settlementSupportingRecord.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.settlementEscalation.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.settlementWorkflowTask.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.settlementWorkflowHistory.deleteMany({ where: { settlementId: { in: settlementIds } } });
      await prisma.financialTransaction.updateMany({
        where: { settlementId: { in: settlementIds } },
        data: { settlementId: null }
      });
      await prisma.settlement.deleteMany({ where: { id: { in: settlementIds } } });
    }

    if (fixture?.centerProfile?.id) {
      await prisma.centerProfile.deleteMany({ where: { id: fixture.centerProfile.id } });
    }
    if (fixture?.franchiseProfile?.id) {
      await prisma.franchiseProfile.deleteMany({ where: { id: fixture.franchiseProfile.id } });
    }
    if (fixture?.centerUser?.id || fixture?.franchiseUser?.id) {
      await prisma.authUser.deleteMany({
        where: {
          id: {
            in: [fixture.centerUser?.id, fixture.franchiseUser?.id].filter(Boolean)
          }
        }
      });
    }
  });

  test("runs the governed settlement workflow chain with immutable history and task orchestration", async () => {
    const settlement = await createSettlement({
      tenantId: fixture.tenant.id,
      businessPartnerId: fixture.bpPartner.id,
      status: "DRAFT",
      month: 4
    });
    settlementIds.push(settlement.id);

    const supportingRecord = await addSettlementSupportingRecord({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.centerUser.id,
      actorRole: "CENTER",
      recordType: "CENTER_REVENUE_SHEET",
      fileUrl: "https://files.example.local/center-revenue.csv",
      fileName: "center-revenue.csv",
      mimeType: "text/csv",
      notes: "Center supporting revenue sheet"
    });

    expect(supportingRecord.uploadedByRole).toBe("CENTER");

    const submitted = await submitSettlementForReview({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.centerUser.id,
      actorRole: "CENTER",
      expectedVersion: 1,
      notes: "Submitted for franchise review"
    });

    expect(submitted.settlement.status).toBe("PENDING_REVIEW");
    expect(submitted.settlement.workflowVersion).toBe(2);
    expect(submitted.history.actionType).toBe("SUBMIT");
    expect(submitted.nextTask?.taskType).toBe("REVIEW_REQUIRED");
    expect(submitted.nextTask?.targetRole).toBe("FRANCHISE");

    const reviewed = await markSettlementReviewed({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: 2,
      notes: "Reviewed by franchise"
    });

    expect(reviewed.settlement.status).toBe("REVIEWED");
    expect(reviewed.settlement.workflowVersion).toBe(3);
    expect(reviewed.history.actionType).toBe("REVIEW");
    expect(reviewed.nextTask?.taskType).toBe("APPROVAL_REQUIRED");
    expect(reviewed.nextTask?.targetRole).toBe("BP");
    expect(reviewed.nextTask?.targetUserId).toBe(fixture.bpUser.id);

    const approved = await approveSettlement({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.bpUser.id,
      actorRole: "BP",
      expectedVersion: 3,
      notes: "Approved by BP",
      payoutDueAt: new Date("2099-04-15T00:00:00.000Z")
    });

    expect(approved.settlement.status).toBe("APPROVED");
    expect(approved.settlement.workflowVersion).toBe(4);
    expect(approved.history.actionType).toBe("APPROVE");
    expect(approved.nextTask?.taskType).toBe("PAYOUT_CONFIRMATION");
    expect(approved.nextTask?.targetRole).toBe("SUPERADMIN");
    expect(approved.settlement.approvalActorUserId).toBe(fixture.bpUser.id);

    const paid = await markSettlementPaid({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.superadminUser.id,
      actorRole: "SUPERADMIN",
      expectedVersion: 4,
      payoutReference: `PAY-${randomId("wfpay")}`,
      notes: "Backoffice payout completed"
    });

    expect(paid.settlement.status).toBe("PAID");
    expect(paid.settlement.workflowVersion).toBe(5);
    expect(paid.history.actionType).toBe("MARK_PAID");
    expect(
      paid.settlement.workflowTasks.filter((task) => ["OPEN", "IN_PROGRESS", "OVERDUE"].includes(task.state))
    ).toHaveLength(0);
    expect(paid.settlement.workflowHistory).toHaveLength(4);
    expect(paid.settlement.supportingRecords).toHaveLength(1);
  });

  test("rejects invalid transitions with deterministic workflow errors", async () => {
    const settlement = await createSettlement({
      tenantId: fixture.tenant.id,
      businessPartnerId: fixture.bpPartner.id,
      status: "DRAFT",
      month: 5
    });
    settlementIds.push(settlement.id);

    await expect(
      approveSettlement({
        tenantId: fixture.tenant.id,
        settlementId: settlement.id,
        actorUserId: fixture.bpUser.id,
        actorRole: "BP",
        expectedVersion: 1,
        notes: "Attempt invalid approval"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "INVALID_TRANSITION"
    });

    const historyCount = await prisma.settlementWorkflowHistory.count({
      where: { settlementId: settlement.id }
    });
    expect(historyCount).toBe(0);
  });

  test("fails stale workflow versions with 409 conflicts and no side effects", async () => {
    const settlement = await createSettlement({
      tenantId: fixture.tenant.id,
      businessPartnerId: fixture.bpPartner.id,
      status: "DRAFT",
      month: 6
    });
    settlementIds.push(settlement.id);

    await expect(
      submitSettlementForReview({
        tenantId: fixture.tenant.id,
        settlementId: settlement.id,
        actorUserId: fixture.centerUser.id,
        actorRole: "CENTER",
        expectedVersion: 99,
        notes: "Stale submit"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "WORKFLOW_VERSION_CONFLICT"
    });

    const stored = await prisma.settlement.findUniqueOrThrow({ where: { id: settlement.id } });
    const historyCount = await prisma.settlementWorkflowHistory.count({ where: { settlementId: settlement.id } });

    expect(stored.workflowVersion).toBe(1);
    expect(historyCount).toBe(0);
  });

  test("creates rejection-response tasks and supports franchise reopen", async () => {
    const settlement = await createSettlement({
      tenantId: fixture.tenant.id,
      businessPartnerId: fixture.bpPartner.id,
      status: "REVIEWED",
      currentActionRole: "BP",
      month: 7
    });
    settlementIds.push(settlement.id);

    const rejected = await rejectSettlement({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.bpUser.id,
      actorRole: "BP",
      expectedVersion: 1,
      reason: "Revenue support mismatch",
      notes: "Please resubmit with corrected details",
      franchiseId: fixture.franchiseProfile.id
    });

    expect(rejected.settlement.status).toBe("REJECTED");
    expect(rejected.settlement.workflowVersion).toBe(2);
    expect(rejected.nextTask?.taskType).toBe("REJECTION_RESPONSE");
    expect(rejected.nextTask?.targetUserId).toBe(fixture.franchiseUser.id);

    const reopened = await reopenSettlement({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.franchiseUser.id,
      actorRole: "FRANCHISE",
      expectedVersion: 2,
      notes: "Reopened for correction"
    });

    expect(reopened.settlement.status).toBe("DRAFT");
    expect(reopened.settlement.workflowVersion).toBe(3);
    expect(reopened.settlement.rejectionReason).toBeNull();
    expect(
      reopened.settlement.workflowTasks.filter((task) => ["OPEN", "IN_PROGRESS", "OVERDUE"].includes(task.state))
    ).toHaveLength(0);
  });

  test("persists escalation lifecycle and restores the prior workflow state on resolution", async () => {
    const settlement = await createSettlement({
      tenantId: fixture.tenant.id,
      businessPartnerId: fixture.bpPartner.id,
      status: "REVIEWED",
      currentActionRole: "BP",
      month: 8
    });
    settlementIds.push(settlement.id);

    const escalated = await escalateSettlement({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      actorUserId: fixture.bpUser.id,
      actorRole: "BP",
      expectedVersion: 1,
      escalationType: "UNAPPROVED_SETTLEMENT",
      severity: "HIGH",
      reason: "Approval SLA exceeded",
      notes: "Escalated to priority workflow review",
      franchiseId: fixture.franchiseProfile.id
    });

    expect(escalated.settlement.status).toBe("ESCALATED");
    expect(escalated.settlement.workflowVersion).toBe(2);
    expect(escalated.escalation?.state).toBe("ACTIVE");
    expect(escalated.nextTask?.taskType).toBe("ESCALATION_RESPONSE");

    const resolved = await resolveSettlementEscalation({
      tenantId: fixture.tenant.id,
      settlementId: settlement.id,
      escalationId: escalated.escalation.id,
      actorUserId: fixture.bpUser.id,
      actorRole: "BP",
      expectedVersion: 2,
      notes: "Escalation resolved after workflow review",
      franchiseId: fixture.franchiseProfile.id
    });

    expect(resolved.settlement.status).toBe("REVIEWED");
    expect(resolved.settlement.workflowVersion).toBe(3);
    expect(resolved.escalation.state).toBe("RESOLVED");
    expect(resolved.nextTask?.taskType).toBe("APPROVAL_REQUIRED");
    expect(resolved.nextTask?.targetUserId).toBe(fixture.bpUser.id);
  });

  test("enforces role-safe supporting record and mark-paid restrictions", async () => {
    const settlement = await createSettlement({
      tenantId: fixture.tenant.id,
      businessPartnerId: fixture.bpPartner.id,
      status: "APPROVED",
      currentActionRole: "SUPERADMIN",
      month: 9
    });
    settlementIds.push(settlement.id);

    await expect(
      addSettlementSupportingRecord({
        tenantId: fixture.tenant.id,
        settlementId: settlement.id,
        actorUserId: fixture.bpUser.id,
        actorRole: "BP",
        recordType: "BP_NOTE",
        fileUrl: "https://files.example.local/bp-note.txt",
        fileName: "bp-note.txt"
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "WORKFLOW_PERMISSION_DENIED"
    });

    await expect(
      markSettlementPaid({
        tenantId: fixture.tenant.id,
        settlementId: settlement.id,
        actorUserId: fixture.bpUser.id,
        actorRole: "BP",
        expectedVersion: 1,
        payoutReference: `PAY-${randomId("forbidden")}`
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "WORKFLOW_PERMISSION_DENIED"
    });
  });
});