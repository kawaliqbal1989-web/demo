import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState } from "../../../components/ErrorState";
import { LoadingState } from "../../../components/LoadingState";
import { PageHeader } from "../../../components/PageHeader";
import { useSettlementWorkflowDetail } from "../hooks/useSettlementWorkflowDetail";
import { SettlementSupportingRecordsSection } from "../components/SettlementSupportingRecordsSection";
import { SettlementWorkflowActionPanel } from "../components/SettlementWorkflowActionPanel";
import { SettlementWorkflowEscalationsPanel } from "../components/SettlementWorkflowEscalationsPanel";
import { SettlementWorkflowTimeline } from "../components/SettlementWorkflowTimeline";
import {
  DetailRow,
  WorkflowBadge,
  formatWorkflowCurrency,
  formatWorkflowDate,
  formatWorkflowDateTime,
  getWorkflowScopeLabel
} from "../components/SettlementWorkflowPrimitives";

function SettlementWorkflowDetailPage() {
  const { id: settlementId } = useParams();
  const [refreshTick, setRefreshTick] = useState(0);
  const detail = useSettlementWorkflowDetail(settlementId, {
    enabled: Boolean(settlementId),
    refreshTick
  });

  const settlement = detail.settlement;
  const workflow = detail.workflow;

  if (!settlementId) {
    return <ErrorState title="Settlement missing" message="No settlement id was provided for this route." />;
  }

  if (detail.loading && !settlement) {
    return <LoadingState label="Loading settlement workflow..." />;
  }

  if (detail.error && !settlement) {
    return (
      <ErrorState
        title="Could not load settlement workflow"
        message={detail.error.message || "Settlement detail could not be fetched."}
        onRetry={() => setRefreshTick((current) => current + 1)}
      />
    );
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title={settlement ? `Settlement ${settlement.periodLabel}` : "Settlement Workflow"}
        subtitle={settlement ? getWorkflowScopeLabel(settlement) : "Workflow detail"}
        actions={
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="button secondary" style={{ width: "auto", textDecoration: "none" }} to="/bp/settlements">
              Back to Queue
            </Link>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setRefreshTick((current) => current + 1)}>
              Refresh Detail
            </button>
          </div>
        }
      />

      {detail.error && settlement ? (
        <div role="alert" className="card" style={{ color: "var(--color-text-danger)" }}>
          {detail.error.message || "The latest workflow refresh failed. Showing the last loaded detail."}
        </div>
      ) : null}

      {settlement ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <WorkflowBadge value={workflow.status || settlement.status} />
              <WorkflowBadge value={workflow.currentActionRole || settlement.currentActionRole || "UNASSIGNED"} tone="info" />
              <WorkflowBadge value={`V${workflow.workflowVersion || settlement.workflowVersion || 0}`} />
            </div>
            <DetailRow label="Gross Amount" value={formatWorkflowCurrency(settlement.grossAmount)} />
            <DetailRow label="Partner Earnings" value={formatWorkflowCurrency(settlement.partnerEarnings)} />
            <DetailRow label="Platform Earnings" value={formatWorkflowCurrency(settlement.platformEarnings)} />
            <DetailRow label="Generated" value={formatWorkflowDate(settlement.generatedAt)} />
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <DetailRow label="Submitted" value={formatWorkflowDateTime(settlement.submittedAt)} />
            <DetailRow label="Reviewed" value={formatWorkflowDateTime(settlement.reviewedAt)} />
            <DetailRow label="Approved" value={formatWorkflowDateTime(settlement.approvedAt)} />
            <DetailRow label="Rejected" value={formatWorkflowDateTime(settlement.rejectedAt)} />
            <DetailRow label="Last Workflow Action" value={formatWorkflowDateTime(settlement.lastWorkflowActionAt)} />
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <DetailRow label="Payout Due" value={formatWorkflowDateTime(settlement.payoutDueAt)} />
            <DetailRow label="Paid At" value={formatWorkflowDateTime(settlement.paidAt)} />
            <DetailRow label="Payout Reference" value={settlement.payoutReference || "-"} />
            <DetailRow label="Rejection Reason" value={settlement.rejectionReason || "-"} />
            <DetailRow label="Operational Notes" value={settlement.operationalNotes || "-"} />
          </div>
        </div>
      ) : null}

      <SettlementWorkflowActionPanel
        escalations={detail.escalations}
        settlementId={settlementId}
        workflow={workflow}
        onActionComplete={() => setRefreshTick((current) => current + 1)}
      />

      <SettlementWorkflowTimeline history={detail.history} />
      <SettlementWorkflowEscalationsPanel escalations={detail.escalations} tasks={detail.tasks} />
      <SettlementSupportingRecordsSection
        canUpload={workflow.canUploadSupportingRecord}
        settlementId={settlementId}
        supportingRecords={detail.supportingRecords}
        onUploadComplete={() => setRefreshTick((current) => current + 1)}
      />
    </section>
  );
}

export { SettlementWorkflowDetailPage };