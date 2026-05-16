import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  acknowledgeFranchiseEscalation,
  acknowledgeFranchiseWorkflow,
  escalateFranchiseWorkflow,
  forwardFranchiseEscalation,
  getFranchiseWorkflowDetail,
  getFranchiseWorkflowHistory,
  reopenFranchiseWorkflow,
  requestFranchiseCenterAction,
  resolveFranchiseWorkflow,
  reviewFranchiseWorkflow
} from "../../services/franchiseService";

const ACTION_LABELS = {
  REVIEW: "Review",
  ACKNOWLEDGE: "Acknowledge",
  REQUEST_CENTER_ACTION: "Request Center Action",
  ESCALATE_CENTER_RISK: "Escalate Center Risk",
  ACKNOWLEDGE_ESCALATION: "Acknowledge Escalation",
  FORWARD_ESCALATION: "Forward Escalation",
  RESOLVE: "Resolve Issue",
  REOPEN: "Reopen Issue"
};

const ACTION_DIALOGS = {
  REVIEW: {
    title: "Review Operational Issue",
    description: "Capture optional notes to preserve review context in immutable workflow history.",
    fields: [{ name: "notes", label: "Notes", type: "textarea", required: false }]
  },
  ACKNOWLEDGE: {
    title: "Acknowledge Operational Issue",
    description: "Use acknowledgement when the anomaly has been seen and is under franchise watch.",
    fields: [{ name: "notes", label: "Notes", type: "textarea", required: false }]
  },
  REQUEST_CENTER_ACTION: {
    title: "Request Center Action",
    description: "Send this issue back to the center with a due date and action note.",
    fields: [
      { name: "notes", label: "Action Note", type: "textarea", required: false },
      { name: "taskDueAt", label: "Due At", type: "datetime-local", required: false }
    ]
  },
  ESCALATE_CENTER_RISK: {
    title: "Escalate Center Risk",
    description: "Escalation creates a governed escalation record and moves the item into the escalation queue.",
    fields: [
      { name: "reason", label: "Escalation Reason", type: "textarea", required: true },
      { name: "notes", label: "Notes", type: "textarea", required: false }
    ]
  },
  ACKNOWLEDGE_ESCALATION: {
    title: "Acknowledge Escalation",
    description: "Capture acknowledgement notes before resolving or forwarding the escalation.",
    fields: [{ name: "notes", label: "Notes", type: "textarea", required: false }]
  },
  FORWARD_ESCALATION: {
    title: "Forward Escalation",
    description: "Forward the escalation into the BP governance queue with a clear forwarding reason.",
    fields: [
      { name: "reason", label: "Forwarding Reason", type: "textarea", required: true },
      { name: "notes", label: "Notes", type: "textarea", required: false },
      { name: "taskDueAt", label: "Due At", type: "datetime-local", required: false }
    ]
  },
  RESOLVE: {
    title: "Resolve Operational Issue",
    description: "Resolve closes the operational workflow and ends any active escalation chain.",
    fields: [{ name: "notes", label: "Resolution Note", type: "textarea", required: false }]
  },
  REOPEN: {
    title: "Reopen Operational Issue",
    description: "Reopen returns the issue to the review queue with a new workflow version.",
    fields: [{ name: "notes", label: "Reopen Note", type: "textarea", required: false }]
  }
};

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: {
      background: "rgba(15, 23, 42, 0.08)",
      color: "var(--color-text)"
    },
    danger: {
      background: "var(--color-bg-danger-light)",
      color: "var(--color-text-danger)"
    },
    warning: {
      background: "var(--color-bg-warning)",
      color: "var(--color-text-warning)"
    },
    success: {
      background: "rgba(34, 197, 94, 0.12)",
      color: "#166534"
    },
    info: {
      background: "var(--color-bg-info-light)",
      color: "var(--color-text-info)"
    }
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...(tones[tone] || tones.neutral)
      }}
    >
      {children}
    </span>
  );
}

function severityTone(value) {
  if (value === "CRITICAL") {
    return "danger";
  }
  if (value === "HIGH" || value === "WARNING") {
    return "warning";
  }
  return "info";
}

function createInitialValues(actionType) {
  const dialog = ACTION_DIALOGS[actionType];
  return (dialog?.fields || []).reduce((accumulator, field) => {
    accumulator[field.name] = "";
    return accumulator;
  }, {});
}

function normalizeActionPayload(actionType, values, workflowVersion) {
  const payload = {
    expectedVersion: workflowVersion
  };

  if (values.notes?.trim()) {
    payload.notes = values.notes.trim();
  }

  if (values.reason?.trim()) {
    payload.reason = values.reason.trim();
  }

  if (values.taskDueAt) {
    payload.taskDueAt = new Date(values.taskDueAt).toISOString();
  }

  return payload;
}

async function runWorkflowAction(actionType, workflowId, payload) {
  switch (actionType) {
    case "REVIEW":
      return reviewFranchiseWorkflow(workflowId, payload);
    case "ACKNOWLEDGE":
      return acknowledgeFranchiseWorkflow(workflowId, payload);
    case "REQUEST_CENTER_ACTION":
      return requestFranchiseCenterAction(workflowId, payload);
    case "ESCALATE_CENTER_RISK":
      return escalateFranchiseWorkflow(workflowId, payload);
    case "ACKNOWLEDGE_ESCALATION":
      return acknowledgeFranchiseEscalation(workflowId, payload);
    case "FORWARD_ESCALATION":
      return forwardFranchiseEscalation(workflowId, payload);
    case "RESOLVE":
      return resolveFranchiseWorkflow(workflowId, payload);
    case "REOPEN":
      return reopenFranchiseWorkflow(workflowId, payload);
    default:
      throw new Error(`Unsupported workflow action: ${actionType}`);
  }
}

function WorkflowActionDialog({ actionType, values, busy, onChange, onCancel, onConfirm }) {
  const config = ACTION_DIALOGS[actionType];
  const isInvalid = (config?.fields || []).some((field) => field.required && !String(values[field.name] || "").trim());

  if (!config) {
    return null;
  }

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
      <div className="card" style={{ width: "100%", maxWidth: 580, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h3 style={{ margin: 0 }}>{config.title}</h3>
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{config.description}</p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {config.fields.map((field) => (
            <label key={field.name} style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  className="input"
                  rows={4}
                  value={values[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
              ) : (
                <input
                  className="input"
                  type={field.type}
                  value={values[field.name] || ""}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="button" type="button" style={{ width: "auto" }} onClick={onConfirm} disabled={busy || isInvalid}>
            {busy ? "Working..." : ACTION_LABELS[actionType] || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FranchiseWorkflowDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [historyData, setHistoryData] = useState({ items: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [dialogAction, setDialogAction] = useState(null);
  const [dialogValues, setDialogValues] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([getFranchiseWorkflowDetail(id), getFranchiseWorkflowHistory(id, { limit: 50, offset: 0 })])
      .then(([detailResponse, historyResponse]) => {
        if (cancelled) {
          return;
        }

        setDetail(detailResponse.data || null);
        setHistoryData(historyResponse.data || { items: [] });
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(nextError) || "Failed to load workflow detail.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);

  const workflow = detail?.workflow || null;
  const notification = detail?.notification || null;
  const center = detail?.center || null;
  const tasks = detail?.tasks || [];
  const escalations = detail?.escalations || [];
  const activeEscalation = useMemo(
    () => escalations.find((item) => ["ACTIVE", "ACKNOWLEDGED", "FORWARDED"].includes(item.state)) || null,
    [escalations]
  );

  async function handleActionConfirm() {
    if (!dialogAction || !workflow) {
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      await runWorkflowAction(
        dialogAction,
        workflow.id,
        normalizeActionPayload(dialogAction, dialogValues, workflow.workflowVersion)
      );
      setDialogAction(null);
      setDialogValues({});
      setRefreshTick((tick) => tick + 1);
    } catch (nextError) {
      setActionError(getFriendlyErrorMessage(nextError) || "Workflow action failed.");
    } finally {
      setBusy(false);
    }
  }

  function openActionDialog(actionType) {
    setActionError("");
    setDialogAction(actionType);
    setDialogValues(createInitialValues(actionType));
  }

  if (loading && !detail) {
    return <LoadingState label="Loading workflow detail..." />;
  }

  if (!detail) {
    return (
      <section className="card">
        <p style={{ margin: 0 }}>{error || "Workflow detail is unavailable."}</p>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={severityTone(workflow.severity)}>{workflow.severity}</Badge>
            <Badge>{workflow.queueType}</Badge>
            <Badge tone={workflow.status === "RESOLVED" ? "success" : "neutral"}>{workflow.status}</Badge>
            <Badge tone="info">V{workflow.workflowVersion}</Badge>
          </div>
          <h2 style={{ margin: 0 }}>{workflow.title}</h2>
          <div style={{ color: "var(--color-text-muted)", maxWidth: 920 }}>{workflow.summary}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Notification type: {workflow.notificationType} · Last triggered {formatDateTime(workflow.lastTriggeredAt)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => setRefreshTick((tick) => tick + 1)}
          >
            Refresh
          </button>
          <Link className="button secondary" style={{ width: "auto" }} to="/franchise/workflows">
            Back To Queue
          </Link>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {actionError ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{actionError}</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: 0.5 }}>
            Scope
          </div>
          <div style={{ fontWeight: 700 }}>{center?.name || "Franchise-wide anomaly"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>{center?.code || workflow.centerId || "No center attached"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Current action role: {workflow.currentActionRole || "Closed"}</div>
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: 0.5 }}>
            Source Metric
          </div>
          <div style={{ display: "grid", gap: 6, color: "var(--color-text-muted)" }}>
            <div>Metric: {notification?.metricKey || "-"}</div>
            <div>Observed: {notification?.observedValue ?? "-"}</div>
            <div>Threshold: {notification?.thresholdValue ?? "-"}</div>
            <div>Delta: {notification?.deltaPercent ?? "-"}</div>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: 0.5 }}>
            Active Escalation
          </div>
          {activeEscalation ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge tone="warning">{activeEscalation.escalationType}</Badge>
                <Badge tone="warning">{activeEscalation.state}</Badge>
              </div>
              <div style={{ color: "var(--color-text-muted)" }}>
                Triggered {formatDateTime(activeEscalation.triggeredAt)}
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--color-text-muted)" }}>No active escalation is attached to this workflow.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Workflow Actions</div>
        {!workflow.allowedActions?.length ? (
          <div style={{ color: "var(--color-text-muted)" }}>This workflow has no franchise actions available in its current state.</div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {workflow.allowedActions.map((actionType) => (
              <button
                key={actionType}
                className={actionType === "RESOLVE" ? "button" : "button secondary"}
                type="button"
                style={{ width: "auto" }}
                disabled={busy}
                onClick={() => openActionDialog(actionType)}
              >
                {ACTION_LABELS[actionType] || actionType}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Open Tasks</div>
          {tasks.length ? (
            tasks.map((task) => (
              <div key={task.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--color-border-divider)", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge>{task.taskType}</Badge>
                  <Badge tone={task.state === "COMPLETED" ? "success" : "info"}>{task.state}</Badge>
                </div>
                <div style={{ color: "var(--color-text-muted)" }}>Target role: {task.targetRole}</div>
                <div style={{ color: "var(--color-text-muted)" }}>Due at: {formatDateTime(task.dueAt)}</div>
              </div>
            ))
          ) : (
            <div style={{ color: "var(--color-text-muted)" }}>No active or historical tasks were returned for this issue.</div>
          )}
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Escalation Log</div>
          {escalations.length ? (
            escalations.map((item) => (
              <div key={item.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--color-border-divider)", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge tone="warning">{item.escalationType}</Badge>
                  <Badge tone="warning">{item.state}</Badge>
                </div>
                <div style={{ color: "var(--color-text-muted)" }}>Severity: {item.severity}</div>
                <div style={{ color: "var(--color-text-muted)" }}>Triggered: {formatDateTime(item.triggeredAt)}</div>
                {item.escalationReason ? <div>{item.escalationReason}</div> : null}
              </div>
            ))
          ) : (
            <div style={{ color: "var(--color-text-muted)" }}>No escalations have been raised for this workflow yet.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Immutable Timeline</div>
        {(historyData.items || []).length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {historyData.items.map((item) => (
              <div key={item.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--color-border-divider)", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge>{item.actionType}</Badge>
                  <span style={{ color: "var(--color-text-muted)" }}>{formatDateTime(item.createdAt)}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>
                    V{item.expectedVersion} to V{item.resultingVersion}
                  </span>
                </div>
                <div style={{ color: "var(--color-text-muted)" }}>
                  Actor: {item.actorUser?.email || item.actorRole || "SYSTEM"}
                </div>
                <div style={{ color: "var(--color-text-muted)" }}>
                  {item.fromStatus || "NEW"} to {item.toStatus}
                </div>
                {item.reason ? <div>Reason: {item.reason}</div> : null}
                {item.notes ? <div>Notes: {item.notes}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--color-text-muted)" }}>No history has been recorded yet.</div>
        )}
      </div>

      {dialogAction ? (
        <WorkflowActionDialog
          actionType={dialogAction}
          values={dialogValues}
          busy={busy}
          onChange={(fieldName, value) => {
            setDialogValues((current) => ({ ...current, [fieldName]: value }));
          }}
          onCancel={() => {
            setDialogAction(null);
            setDialogValues({});
          }}
          onConfirm={() => {
            void handleActionConfirm();
          }}
        />
      ) : null}
    </section>
  );
}

export { FranchiseWorkflowDetailPage };