import { jest } from "@jest/globals";
import { ensureAuthUser, prisma, randomId } from "../helpers/test-helpers.js";

jest.setTimeout(120000);

describe("SETTLEMENT WORKFLOW SCHEMA FOUNDATION", () => {
  let tenant;
  let bpUser;
  let bpPartner;
  let franchiseUser;
  let franchiseProfile;
  let centerUser;
  let centerProfile;
  const settlementIds = [];

  beforeAll(async () => {
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

    franchiseUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("settlementwf-fr")}@abacusweb.local`,
      role: "FRANCHISE"
    });
    franchiseProfile = await prisma.franchiseProfile.findUniqueOrThrow({
      where: { authUserId: franchiseUser.id }
    });

    centerUser = await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: `${randomId("settlementwf-ce")}@abacusweb.local`,
      role: "CENTER"
    });
    centerProfile = await prisma.centerProfile.findUniqueOrThrow({
      where: { authUserId: centerUser.id }
    });
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

    await prisma.centerProfile.deleteMany({ where: { authUserId: centerUser.id } });
    await prisma.franchiseProfile.deleteMany({ where: { authUserId: franchiseUser.id } });
    await prisma.authUser.deleteMany({ where: { id: { in: [centerUser.id, franchiseUser.id] } } });
  });

  test("supports legacy and workflow statuses while defaulting workflowVersion", async () => {
    const legacySettlement = await prisma.settlement.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        periodYear: 2099,
        periodMonth: 1,
        periodStart: new Date("2099-01-01T00:00:00.000Z"),
        periodEnd: new Date("2099-01-31T23:59:59.999Z"),
        grossAmount: 1000,
        partnerEarnings: 800,
        platformEarnings: 200,
        status: "PENDING"
      }
    });
    settlementIds.push(legacySettlement.id);

    const workflowSettlement = await prisma.settlement.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        periodYear: 2099,
        periodMonth: 2,
        periodStart: new Date("2099-02-01T00:00:00.000Z"),
        periodEnd: new Date("2099-02-28T23:59:59.999Z"),
        grossAmount: 2000,
        partnerEarnings: 1600,
        platformEarnings: 400,
        status: "DRAFT",
        currentActionRole: "FRANCHISE"
      }
    });
    settlementIds.push(workflowSettlement.id);

    expect(legacySettlement.status).toBe("PENDING");
    expect(legacySettlement.workflowVersion).toBe(1);
    expect(workflowSettlement.status).toBe("DRAFT");
    expect(workflowSettlement.workflowVersion).toBe(1);
    expect(workflowSettlement.currentActionRole).toBe("FRANCHISE");
  });

  test("persists immutable history, tasks, escalations, and supporting records with scope relations", async () => {
    const settlement = await prisma.settlement.create({
      data: {
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        periodYear: 2099,
        periodMonth: 3,
        periodStart: new Date("2099-03-01T00:00:00.000Z"),
        periodEnd: new Date("2099-03-31T23:59:59.999Z"),
        grossAmount: 3000,
        partnerEarnings: 2400,
        platformEarnings: 600,
        status: "PENDING_REVIEW",
        currentActionRole: "BP",
        submittedAt: new Date("2099-03-03T10:00:00.000Z")
      }
    });
    settlementIds.push(settlement.id);

    const history = await prisma.settlementWorkflowHistory.create({
      data: {
        settlementId: settlement.id,
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseProfile.id,
        centerId: centerProfile.id,
        fromStatus: "DRAFT",
        toStatus: "PENDING_REVIEW",
        actionType: "SUBMIT",
        actorUserId: franchiseUser.id,
        actorRole: "FRANCHISE",
        expectedVersion: 1,
        resultingVersion: 2,
        notes: "Submitted for BP review"
      }
    });

    const task = await prisma.settlementWorkflowTask.create({
      data: {
        settlementId: settlement.id,
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseProfile.id,
        centerId: centerProfile.id,
        targetRole: "BP",
        targetUserId: bpUser.id,
        taskType: "APPROVAL_REQUIRED",
        dueAt: new Date("2099-03-10T00:00:00.000Z")
      }
    });

    const escalation = await prisma.settlementEscalation.create({
      data: {
        settlementId: settlement.id,
        tenantId: tenant.id,
        businessPartnerId: bpPartner.id,
        franchiseId: franchiseProfile.id,
        centerId: centerProfile.id,
        escalationType: "UNAPPROVED_SETTLEMENT",
        severity: "HIGH",
        escalationReason: "Approval SLA exceeded"
      }
    });

    const supportingRecord = await prisma.settlementSupportingRecord.create({
      data: {
        settlementId: settlement.id,
        tenantId: tenant.id,
        uploadedByUserId: centerUser.id,
        uploadedByRole: "CENTER",
        recordType: "REVENUE_WORKSHEET",
        fileUrl: "https://files.example.local/settlements/supporting.csv",
        fileName: "supporting.csv",
        mimeType: "text/csv",
        notes: "Center supporting worksheet"
      }
    });

    const hydratedSettlement = await prisma.settlement.findUniqueOrThrow({
      where: { id: settlement.id },
      include: {
        workflowHistory: {
          include: {
            actorUser: true,
            businessPartner: true,
            franchise: true,
            center: true
          }
        },
        workflowTasks: true,
        escalations: true,
        supportingRecords: {
          include: {
            uploadedByUser: true
          }
        }
      }
    });

    expect(history.actorRole).toBe("FRANCHISE");
    expect(task.state).toBe("OPEN");
    expect(task.escalationCount).toBe(0);
    expect(escalation.state).toBe("ACTIVE");
    expect(supportingRecord.uploadedByRole).toBe("CENTER");
    expect(hydratedSettlement.workflowHistory).toHaveLength(1);
    expect(hydratedSettlement.workflowTasks).toHaveLength(1);
    expect(hydratedSettlement.escalations).toHaveLength(1);
    expect(hydratedSettlement.supportingRecords).toHaveLength(1);
    expect(hydratedSettlement.workflowHistory[0].actorUser.id).toBe(franchiseUser.id);
    expect(hydratedSettlement.workflowHistory[0].businessPartner?.id).toBe(bpPartner.id);
    expect(hydratedSettlement.workflowHistory[0].franchise?.id).toBe(franchiseProfile.id);
    expect(hydratedSettlement.workflowHistory[0].center?.id).toBe(centerProfile.id);
    expect(hydratedSettlement.supportingRecords[0].uploadedByUser.id).toBe(centerUser.id);
  });

  test("creates the queue and timeline indexes expected by workflow scans", async () => {
    const settlementIndexes = await prisma.$queryRawUnsafe("SHOW INDEX FROM settlement");
    const taskIndexes = await prisma.$queryRawUnsafe("SHOW INDEX FROM settlementworkflowtask");
    const historyIndexes = await prisma.$queryRawUnsafe("SHOW INDEX FROM settlementworkflowhistory");
    const escalationIndexes = await prisma.$queryRawUnsafe("SHOW INDEX FROM settlementescalation");

    const settlementIndexNames = new Set(settlementIndexes.map((row) => row.Key_name || row.key_name));
    const taskIndexNames = new Set(taskIndexes.map((row) => row.Key_name || row.key_name));
    const historyIndexNames = new Set(historyIndexes.map((row) => row.Key_name || row.key_name));
    const escalationIndexNames = new Set(escalationIndexes.map((row) => row.Key_name || row.key_name));

    expect(settlementIndexNames.has("sett_t_role_st_u_i")).toBe(true);
    expect(settlementIndexNames.has("sett_t_due_st_i")).toBe(true);
    expect(settlementIndexNames.has("sett_t_wfv_i")).toBe(true);
    expect(taskIndexNames.has("swt_t_role_st_d_i")).toBe(true);
    expect(taskIndexNames.has("swt_t_usr_st_d_i")).toBe(true);
    expect(historyIndexNames.has("swh_set_ct_i")).toBe(true);
    expect(escalationIndexNames.has("se_t_st_sev_tr_i")).toBe(true);
  });
});