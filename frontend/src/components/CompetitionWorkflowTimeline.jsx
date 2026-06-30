import React from "react";
import { useCompetitionWorkflow } from "../hooks/useCompetitionWorkflow";

const ORDERED_STATES = [
  "DRAFT",
  "ENROLLMENT_OPEN",
  "CENTER_SUBMITTED",
  "CENTER_REOPENED",
  "CENTER_LOCKED",
  "FRANCHISE_REVIEW",
  "FRANCHISE_SUBMITTED",
  "BUSINESS_PARTNER_REVIEW",
  "BUSINESS_PARTNER_SUBMITTED",
  "SUPERADMIN_REVIEW",
  "APPROVED",
  "REJECTED",
  "QUESTION_BANK_MAPPING",
  "WORKSHEET_GENERATION",
  "READY_FOR_COMPETITION",
  "COMPETITION_RUNNING",
  "RESULT_PROCESSING",
  "RESULT_PUBLISHED",
  "CERTIFICATE_PUBLISHED",
  "COMPLETED"
];

const STATE_ALIASES = {
  BP_REVIEW: "BUSINESS_PARTNER_REVIEW",
  SUPERADMIN_APPROVAL: "SUPERADMIN_REVIEW"
};

function stepLabel(state) {
  return String(state || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeState(state) {
  const upper = String(state || "").trim().toUpperCase();
  return STATE_ALIASES[upper] || upper;
}

function CompetitionWorkflowTimeline({ competitionId, competition, className, style }) {
  const { data, loading } = useCompetitionWorkflow({ competitionId, competition });
  const workflowState = normalizeState(data?.workflow?.state || null);
  const owner = data?.owner || null;
  const updatedAt = data?.updatedAt || null;

  const currentIndex = workflowState ? ORDERED_STATES.indexOf(workflowState) : -1;

  return (
    <div className={className} style={{ width: "100%", minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Workflow State</div>
          <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{loading ? "Loading..." : workflowState ? stepLabel(workflowState) : "Unknown"}</div>
        </div>
        <div style={{ minWidth: 0, flex: "1 1 140px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current Owner</div>
          <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{owner?.name || owner?.role || "—"}</div>
        </div>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Last Updated</div>
          <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{updatedAt ? new Date(updatedAt).toLocaleString() : "—"}</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, alignItems: "stretch" }}>
          {ORDERED_STATES.map((state, idx) => {
            const status = idx < currentIndex ? "completed" : idx === currentIndex ? "current" : "upcoming";
            return (
              <div
                key={state}
                style={{
                  flex: "0 0 128px",
                  maxWidth: 160,
                  padding: 10,
                  borderRadius: 6,
                  background:
                    status === "completed"
                      ? "var(--color-bg-success)"
                      : status === "current"
                        ? "var(--color-bg-primary)"
                        : "var(--color-bg-muted)",
                  color: status === "upcoming" ? "var(--color-text-muted)" : "var(--color-text)",
                  overflow: "hidden"
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, whiteSpace: "normal", overflowWrap: "anywhere" }}>{stepLabel(state)}</div>
                <div style={{ fontSize: 12, lineHeight: 1.25, whiteSpace: "normal" }}>{status === "completed" ? "Completed" : status === "current" ? "Current" : "Upcoming"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { CompetitionWorkflowTimeline, ORDERED_STATES };
