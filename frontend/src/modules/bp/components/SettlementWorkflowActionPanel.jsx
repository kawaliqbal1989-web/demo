import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getFriendlyErrorMessage } from "../../../utils/apiErrors";
import { useSettlementWorkflowActions } from "../hooks/useSettlementWorkflowActions";
import {
  WorkflowBadge,
  humanizeWorkflowToken,
  isActiveEscalation
} from "./SettlementWorkflowPrimitives";

const ESCALATION_TYPE_OPTIONS = [
  { value: "UNAPPROVED_SETTLEMENT", label: "Unapproved settlement" },
  { value: "PAYOUT_BLOCKER", label: "Payout blocker" },
  { value: "DATA_MISMATCH", label: "Data mismatch" }
];

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
];

const ACTION_LABELS = {
  SUBMIT: "Submit for Review",
  REVIEW: "Mark Reviewed",
  APPROVE: "Approve",
  REJECT: "Reject",
  REOPEN: "Reopen",
  ESCALATE: "Escalate",
  RESOLVE: "Resolve Escalation",
  MARK_PAID: "Mark Paid"
};

const ACTION_DIALOGS = {
  REJECT: {
    title: "Reject Settlement",
    confirmLabel: "Reject",
    description: "Add the rejection reason that should be preserved in workflow history.",
    fields: [
      { name: "reason", label: "Reason", type: "textarea", required: true, placeholder: "Why is this settlement rejected?" },
      { name: "notes", label: "Notes", type: "textarea", placeholder: "Optional internal note" }
    ]
  },
  REOPEN: {
    title: "Reopen Settlement",
    confirmLabel: "Reopen",
    description: "Add a note for why the workflow is being reopened.",
    fields: [
      { name: "notes", label: "Notes", type: "textarea", placeholder: "Optional reopen note" }
    ]
  },
  ESCALATE: {
    title: "Escalate Settlement",
    confirmLabel: "Escalate",
    description: "Escalations suspend the workflow until they are resolved.",
    fields: [
      { name: "escalationType", label: "Escalation Type", type: "select", required: true, options: ESCALATION_TYPE_OPTIONS },
      { name: "severity", label: "Severity", type: "select", required: true, options: SEVERITY_OPTIONS },
      { name: "reason", label: "Reason", type: "textarea", required: true, placeholder: "Why should this settlement be escalated?" },
      { name: "notes", label: "Notes", type: "textarea", placeholder: "Optional escalation context" }
    ]
  },
  RESOLVE: {
    title: "Resolve Escalation",
    confirmLabel: "Resolve",
    description: "Resolution returns the workflow to its previous step.",
    fields: [
      { name: "notes", label: "Resolution Note", type: "textarea", placeholder: "Optional resolution note" }
    ]
  },
  MARK_PAID: {
    title: "Mark Settlement Paid",
    confirmLabel: "Mark Paid",
    description: "Record the payout reference used for this settlement.",
    fields: [
      { name: "payoutReference", label: "Payout Reference", type: "text", required: true, placeholder: "Bank reference / UTR" },
      { name: "paidAt", label: "Paid At", type: "datetime-local" },
      { name: "notes", label: "Notes", type: "textarea", placeholder: "Optional payout note" }
    ]
  }
};

function createInitialDialogValues(actionType) {
  if (actionType === "ESCALATE") {
    return {
      escalationType: "UNAPPROVED_SETTLEMENT",
      severity: "HIGH",
      reason: "",
      notes: ""
    };
  }

  if (actionType === "MARK_PAID") {
    return {
      payoutReference: "",
      paidAt: "",
      notes: ""
    };
  }

  return {
    notes: "",
    reason: ""
  };
}

function normalizeDialogPayload(actionType, values, workflowVersion, activeEscalation) {
  const payload = {
    expectedVersion: workflowVersion
  };

  if (values.notes?.trim()) {
    payload.notes = values.notes.trim();
  }

  if (actionType === "REJECT") {
    payload.reason = values.reason?.trim() || "";
  }

  if (actionType === "ESCALATE") {
    payload.escalationType = values.escalationType;
    payload.severity = values.severity;
    payload.reason = values.reason?.trim() || "";
  }

  if (actionType === "RESOLVE" && activeEscalation?.id) {
    payload.escalationId = activeEscalation.id;
  }

  if (actionType === "MARK_PAID") {
    payload.payoutReference = values.payoutReference?.trim() || "";
    if (values.paidAt) {
      payload.paidAt = new Date(values.paidAt).toISOString();
    }
  }

  return payload;
}

function SettlementWorkflowActionPanel({ settlementId, workflow, escalations = [], onActionComplete }) {
  const [dialogAction, setDialogAction] = useState(null);
  const [dialogValues, setDialogValues] = useState({});
  const activeEscalation = useMemo(
    () => escalations.find((item) => isActiveEscalation(item)) || null,
    [escalations]
  );

  const actions = useSettlementWorkflowActions(settlementId, {
    onSuccess: (_result, actionType) => {
      toast.success(`${ACTION_LABELS[actionType] || humanizeWorkflowToken(actionType)} completed.`);
      setDialogAction(null);
      setDialogValues({});
      onActionComplete?.();
    }
  });

  const allowedActions = Array.isArray(workflow?.allowedActions) ? workflow.allowedActions : [];
  const hasActions = allowedActions.length > 0;
  const dialogConfig = dialogAction ? ACTION_DIALOGS[dialogAction] : null;
  const hasWorkflowVersion = Number.isInteger(workflow?.workflowVersion) && workflow.workflowVersion > 0;

  async function runAction(actionType, payload) {
    switch (actionType) {
      case "SUBMIT":
        await actions.submitSettlement(payload);
        return;
      case "REVIEW":
        await actions.reviewSettlement(payload);
        return;
      case "APPROVE":
        await actions.approveSettlement(payload);
        return;
      case "REJECT":
        await actions.rejectSettlement(payload);
        return;
      case "REOPEN":
        await actions.reopenSettlement(payload);
        return;
      case "ESCALATE":
        await actions.escalateSettlement(payload);
        return;
      case "RESOLVE":
        await actions.resolveEscalation(payload);
        return;
      case "MARK_PAID":
        await actions.markSettlementPaid(payload);
        return;
      default:
        throw new Error(`Unsupported action: ${actionType}`);
    }
  }

  function openDialog(actionType) {
    setDialogAction(actionType);
    setDialogValues(createInitialDialogValues(actionType));
  }

  async function handleActionClick(actionType) {
    if (["REJECT", "REOPEN", "ESCALATE", "RESOLVE", "MARK_PAID"].includes(actionType)) {
      openDialog(actionType);
      return;
    }

    await runAction(actionType, { expectedVersion: workflow?.workflowVersion });
  }

  async function handleDialogSubmit() {
    if (!dialogAction) {
      return;
    }

    const payload = normalizeDialogPayload(
      dialogAction,
      dialogValues,
      workflow?.workflowVersion,
      activeEscalation
    );
    await runAction(dialogAction, payload);
  }

  return (
    <section className="card" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Workflow Actions</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <WorkflowBadge value={workflow?.status || "UNKNOWN"} />
            <WorkflowBadge value={workflow?.currentActionRole || "UNASSIGNED"} tone="info" />
            <WorkflowBadge value={`V${workflow?.workflowVersion || 0}`} tone="neutral" />
          </div>
        </div>

        {activeEscalation ? (
          <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Active Escalation
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <WorkflowBadge value={activeEscalation.escalationType} tone="warning" />
              <WorkflowBadge value={activeEscalation.severity} tone="warning" />
            </div>
          </div>
        ) : null}
      </div>

      {actions.error ? (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 12,
            background: actions.conflictError ? "rgba(245, 158, 11, 0.12)" : "var(--color-bg-danger-light)",
            color: actions.conflictError ? "#92400e" : "var(--color-text-danger)"
          }}
        >
          {getFriendlyErrorMessage(actions.error)}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto" }}
              onClick={() => {
                actions.retry();
                onActionComplete?.();
              }}
            >
              Refresh Workflow State
            </button>
          </div>
        </div>
      ) : null}

      {!hasActions ? (
        <div style={{ color: "var(--color-text-muted)" }}>This workflow step has no server-allowed actions for BP.</div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {allowedActions.map((actionType) => (
            <button
              key={actionType}
              className={actionType === "APPROVE" ? "button" : "button secondary"}
              type="button"
              style={{ width: "auto" }}
              disabled={actions.isBusy || !hasWorkflowVersion || (actionType === "RESOLVE" && !activeEscalation)}
              onClick={() => {
                void handleActionClick(actionType);
              }}
            >
              {ACTION_LABELS[actionType] || humanizeWorkflowToken(actionType)}
            </button>
          ))}
        </div>
      )}

      {dialogConfig ? (
        <WorkflowActionDialog
          busy={actions.isBusy}
          config={dialogConfig}
          values={dialogValues}
          onCancel={() => {
            setDialogAction(null);
            setDialogValues({});
          }}
          onChange={(fieldName, value) => {
            setDialogValues((current) => ({ ...current, [fieldName]: value }));
          }}
          onConfirm={() => {
            void handleDialogSubmit();
          }}
        />
      ) : null}
    </section>
  );
}

function WorkflowActionDialog({ config, values, busy, onChange, onCancel, onConfirm }) {
  const isInvalid = config.fields.some((field) => field.required && !String(values[field.name] || "").trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.35)"
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 560, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 style={{ margin: 0 }}>{config.title}</h3>
          {config.description ? <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{config.description}</p> : null}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {config.fields.map((field) => (
            <label key={field.name} style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className="input"
                  rows={4}
                  value={values[field.name] || ""}
                  placeholder={field.placeholder || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
              ) : field.type === "select" ? (
                <select
                  className="input"
                  value={values[field.name] || field.options?.[0]?.value || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={field.type || "text"}
                  value={values[field.name] || ""}
                  placeholder={field.placeholder || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button"
            type="button"
            style={{ width: "auto" }}
            disabled={busy || isInvalid}
            onClick={onConfirm}
          >
            {busy ? "Saving..." : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { SettlementWorkflowActionPanel };