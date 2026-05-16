import { useMemo } from "react";
import {
  JsonPreview,
  WorkflowBadge,
  formatWorkflowDateTime,
  getWorkflowScopeLabel,
  humanizeWorkflowToken
} from "./SettlementWorkflowPrimitives";

function SettlementWorkflowTimeline({ history = [] }) {
  const orderedHistory = useMemo(() => {
    return [...history].sort((left, right) => {
      const leftTime = new Date(left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.createdAt || 0).getTime();

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return String(left?.id || "").localeCompare(String(right?.id || ""));
    });
  }, [history]);

  return (
    <section className="card" style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Audit Timeline</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
          Immutable workflow history in append-only order.
        </div>
      </div>

      {orderedHistory.length === 0 ? (
        <div style={{ color: "var(--color-text-muted)" }}>No workflow history recorded yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {orderedHistory.map((entry, index) => (
            <article
              key={entry.id}
              style={{
                display: "grid",
                gap: 10,
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--color-border)",
                background: "rgba(148, 163, 184, 0.08)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <WorkflowBadge value={`Step ${index + 1}`} />
                  <WorkflowBadge value={entry.actionType} tone="info" />
                  <span style={{ fontWeight: 700 }}>
                    {humanizeWorkflowToken(entry.fromStatus)} to {humanizeWorkflowToken(entry.toStatus)}
                  </span>
                </div>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{formatWorkflowDateTime(entry.createdAt)}</span>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <span>
                  <strong>Actor:</strong>{" "}
                  {entry.actorUser?.username || entry.actorUser?.email || entry.actorUser?.id || "Workflow actor"}
                  {entry.actorRole ? ` (${humanizeWorkflowToken(entry.actorRole)})` : ""}
                </span>
                <span>
                  <strong>Scope:</strong> {getWorkflowScopeLabel({ franchise: entry.franchise, center: entry.center })}
                </span>
                <span>
                  <strong>Version:</strong> {entry.expectedVersion} to {entry.resultingVersion}
                </span>
                {entry.reason ? (
                  <span>
                    <strong>Reason:</strong> {entry.reason}
                  </span>
                ) : null}
                {entry.notes ? (
                  <span>
                    <strong>Notes:</strong> {entry.notes}
                  </span>
                ) : null}
                {entry.payoutReference ? (
                  <span>
                    <strong>Payout Reference:</strong> {entry.payoutReference}
                  </span>
                ) : null}
              </div>

              <JsonPreview value={entry.metadata} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export { SettlementWorkflowTimeline };