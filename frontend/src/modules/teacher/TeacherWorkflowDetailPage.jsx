import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  acknowledgeTeacherWorkflow,
  bulkGradeTeacherWorkflow,
  completeTeacherWorkflowGrading,
  getTeacherWorkflowDetail,
  getTeacherWorkflowHistory,
  markTeacherWorkflowAttendance,
  reopenTeacherWorkflow,
  resolveTeacherWorkflow,
  reviewTeacherWorkflow,
  startTeacherWorkflowRecovery
} from "../../services/teacherWorkflowService";

const ACTION_LABELS = {
  REVIEW: "Review",
  ACKNOWLEDGE: "Acknowledge",
  START_RECOVERY: "Start Recovery",
  MARK_ATTENDANCE: "Mark Attendance",
  COMPLETE_GRADING: "Complete Grading",
  BULK_GRADE: "Bulk Grade",
  RESOLVE: "Resolve",
  REOPEN: "Reopen"
};

const ACTION_DIALOGS = {
  REVIEW: {
    title: "Review Workflow",
    description: "Capture immutable review notes before moving into classroom execution.",
    fields: [{ name: "notes", label: "Notes", type: "textarea", required: false }]
  },
  ACKNOWLEDGE: {
    title: "Acknowledge Workflow",
    description: "Use acknowledgement when the classroom issue is understood and queued for execution.",
    fields: [{ name: "notes", label: "Notes", type: "textarea", required: false }]
  },
  START_RECOVERY: {
    title: "Start Recovery",
    description: "Create a teacher-owned recovery checkpoint with due date and reason.",
    fields: [
      { name: "reason", label: "Recovery Reason", type: "textarea", required: false },
      { name: "notes", label: "Recovery Notes", type: "textarea", required: false },
      { name: "taskDueAt", label: "Due At", type: "datetime-local", required: false }
    ]
  },
  MARK_ATTENDANCE: {
    title: "Execute Attendance Resolution",
    description: "Resolve delayed attendance by publishing the session or using the full attendance roll if more edits are required.",
    fields: [
      { name: "notes", label: "Execution Notes", type: "textarea", required: false },
      { name: "publish", label: "Publish attendance immediately", type: "checkbox", required: false }
    ]
  },
  COMPLETE_GRADING: {
    title: "Complete Grading",
    description: "Mark one or more worksheet submissions reviewed and append grading metadata to workflow history.",
    fields: [
      { name: "score", label: "Score (optional)", type: "number", required: false },
      { name: "remarks", label: "Remarks", type: "textarea", required: false }
    ]
  },
  BULK_GRADE: {
    title: "Bulk Grade Recovery",
    description: "Resolve grading backlog with a bulk review action while preserving immutable workflow history.",
    fields: [
      { name: "score", label: "Score (optional)", type: "number", required: false },
      { name: "remarks", label: "Remarks", type: "textarea", required: false }
    ]
  },
  RESOLVE: {
    title: "Resolve Workflow",
    description: "Resolve this classroom workflow and close active execution tasks.",
    fields: [{ name: "notes", label: "Resolution Notes", type: "textarea", required: false }]
  },
  REOPEN: {
    title: "Reopen Workflow",
    description: "Return the workflow to the active execution queue with a new version.",
    fields: [{ name: "notes", label: "Reopen Notes", type: "textarea", required: false }]
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

function createInitialValues(actionType, workflow, availableSubmissions) {
  const config = ACTION_DIALOGS[actionType];
  const values = (config?.fields || []).reduce((accumulator, field) => {
    accumulator[field.name] = field.type === "checkbox" ? true : "";
    return accumulator;
  }, {});

  if (actionType === "COMPLETE_GRADING") {
    values.submissionIds = workflow?.worksheetSubmissionId ? [workflow.worksheetSubmissionId] : availableSubmissions.slice(0, 1).map((item) => item.submissionId);
  }

  if (actionType === "BULK_GRADE") {
    values.submissionIds = availableSubmissions.map((item) => item.submissionId);
  }

  return values;
}

function normalizeActionPayload(actionType, values, workflowVersion) {
  const payload = { expectedVersion: workflowVersion };

  if (values.notes?.trim()) {
    payload.notes = values.notes.trim();
  }
  if (values.reason?.trim()) {
    payload.reason = values.reason.trim();
  }
  if (values.taskDueAt) {
    payload.taskDueAt = new Date(values.taskDueAt).toISOString();
  }
  if (values.publish !== undefined) {
    payload.publish = Boolean(values.publish);
  }
  if (values.score !== undefined && values.score !== null && values.score !== "") {
    payload.score = Number(values.score);
  }
  if (values.remarks?.trim()) {
    payload.remarks = values.remarks.trim();
  }
  if (Array.isArray(values.submissionIds) && values.submissionIds.length) {
    payload.submissionIds = values.submissionIds;
  }

  return payload;
}

async function runWorkflowAction(actionType, workflowId, payload) {
  switch (actionType) {
    case "REVIEW":
      return reviewTeacherWorkflow(workflowId, payload);
    case "ACKNOWLEDGE":
      return acknowledgeTeacherWorkflow(workflowId, payload);
    case "START_RECOVERY":
      return startTeacherWorkflowRecovery(workflowId, payload);
    case "MARK_ATTENDANCE":
      return markTeacherWorkflowAttendance(workflowId, payload);
    case "COMPLETE_GRADING":
      return completeTeacherWorkflowGrading(workflowId, payload);
    case "BULK_GRADE":
      return bulkGradeTeacherWorkflow(workflowId, payload);
    case "RESOLVE":
      return resolveTeacherWorkflow(workflowId, payload);
    case "REOPEN":
      return reopenTeacherWorkflow(workflowId, payload);
    default:
      throw new Error(`Unsupported workflow action: ${actionType}`);
  }
}

function PreviewBlock({ metadata }) {
  const preview = metadata?.preview || null;
  if (!preview) {
    return <div style={{ color: "var(--color-text-muted)" }}>No preview metadata is available for this workflow.</div>;
  }

  const sections = [
    { key: "delayedSessions", label: "Delayed Attendance Sessions" },
    { key: "absenteePreview", label: "Absentee Follow-up" },
    { key: "backlogPreview", label: "Grading Backlog" },
    { key: "overduePreview", label: "Overdue Reviews" }
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {preview.summary ? (
        <div style={{ display: "grid", gap: 4, color: "var(--color-text-muted)" }}>
          {Object.entries(preview.summary).slice(0, 6).map(([key, value]) => (
            <div key={key}>{key}: {value ?? "-"}</div>
          ))}
        </div>
      ) : null}

      {sections.map((section) => {
        const items = Array.isArray(preview[section.key]) ? preview[section.key] : [];
        if (!items.length) {
          return null;
        }

        return (
          <div key={section.key} style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{section.label}</div>
            {items.map((item, index) => (
              <div key={`${section.key}-${item.submissionId || item.sessionId || item.studentId || index}`} style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                {item.studentName || item.batchName || item.submissionId || item.sessionId}
                {item.pendingDays !== undefined ? ` · Pending ${item.pendingDays}d` : ""}
                {item.overdueDays !== undefined ? ` · Overdue ${item.overdueDays}d` : ""}
                {item.delayedDays !== undefined ? ` · Delayed ${item.delayedDays}d` : ""}
                {item.sessionDate ? ` · ${formatDateTime(item.sessionDate)}` : ""}
                {item.submittedAt ? ` · ${formatDateTime(item.submittedAt)}` : ""}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function WorkflowActionDialog({ actionType, values, availableSubmissions, busy, onChange, onToggleSubmission, onCancel, onConfirm }) {
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
      <div className="card" style={{ width: "100%", maxWidth: 620, display: "grid", gap: 16, maxHeight: "85vh", overflow: "auto" }}>
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
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(event) => onChange(field.name, event.target.checked)}
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

          {(actionType === "COMPLETE_GRADING" || actionType === "BULK_GRADE") && availableSubmissions.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Select submissions</div>
              <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                {availableSubmissions.map((item) => {
                  const checked = Array.isArray(values.submissionIds) && values.submissionIds.includes(item.submissionId);
                  return (
                    <label key={item.submissionId} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input type="checkbox" checked={checked} onChange={() => onToggleSubmission(item.submissionId)} />
                      <span style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>{item.studentName || item.submissionId}</span>
                        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                          {item.levelName ? `${item.levelName} · ` : ""}
                          {item.pendingDays !== undefined ? `Pending ${item.pendingDays}d` : item.overdueDays !== undefined ? `Overdue ${item.overdueDays}d` : "Review item"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
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

function TeacherWorkflowDetailPage() {
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

    Promise.all([getTeacherWorkflowDetail(id), getTeacherWorkflowHistory(id, { limit: 50, offset: 0 })])
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
  const center = detail?.center || null;
  const teacher = detail?.teacher || null;
  const tasks = detail?.tasks || [];
  const availableSubmissions = useMemo(() => {
    const preview = workflow?.metadata?.preview || {};
    const combined = [...(preview.backlogPreview || []), ...(preview.overduePreview || [])];
    const seen = new Set();
    return combined.filter((item) => {
      if (!item?.submissionId || seen.has(item.submissionId)) {
        return false;
      }
      seen.add(item.submissionId);
      return true;
    });
  }, [workflow]);

  function openDialog(actionType) {
    setActionError("");
    setDialogAction(actionType);
    setDialogValues(createInitialValues(actionType, workflow, availableSubmissions));
  }

  async function handleActionConfirm() {
    if (!dialogAction || !workflow) {
      return;
    }

    setBusy(true);
    setActionError("");

    try {
      await runWorkflowAction(dialogAction, workflow.id, normalizeActionPayload(dialogAction, dialogValues, workflow.workflowVersion));
      setDialogAction(null);
      setDialogValues({});
      setRefreshTick((tick) => tick + 1);
    } catch (nextError) {
      setActionError(getFriendlyErrorMessage(nextError) || "Workflow action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !workflow) {
    return <LoadingState label="Loading workflow detail..." />;
  }

  if (error) {
    return (
      <div className="card">
        <p className="error" style={{ margin: 0 }}>{error}</p>
      </div>
    );
  }

  if (!workflow) {
    return null;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <Link to="/teacher/workflows" style={{ color: "var(--color-text-muted)", textDecoration: "none" }}>
            ← Back to workflow queue
          </Link>
          <h2 style={{ margin: 0 }}>{workflow.title}</h2>
          <div style={{ color: "var(--color-text-muted)" }}>{workflow.summary}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge tone={severityTone(workflow.severity)}>{workflow.severity}</Badge>
            <Badge>{workflow.status}</Badge>
            <Badge tone="info">{workflow.queueType}</Badge>
            <Badge tone="info">{workflow.workflowType}</Badge>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {workflow.attendanceSessionId ? (
            <Link className="button secondary" style={{ width: "auto" }} to={`/attendance/sessions/${workflow.attendanceSessionId}`}>
              Open Attendance Roll
            </Link>
          ) : null}
          {workflow.studentId ? (
            <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${workflow.studentId}`}>
              Open Student
            </Link>
          ) : null}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div className="card" style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)" }}>Teacher</div>
          <div style={{ fontWeight: 700 }}>{teacher?.fullName || "Teacher"}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{center?.name || "Classroom center"}</div>
        </div>
        <div className="card" style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)" }}>Batch</div>
          <div style={{ fontWeight: 700 }}>{workflow.batchName || "-"}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Session {workflow.attendanceSessionId || "-"}</div>
        </div>
        <div className="card" style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)" }}>Student / Submission</div>
          <div style={{ fontWeight: 700 }}>{workflow.studentName || "-"}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{workflow.worksheetSubmissionId || "-"}</div>
        </div>
        <div className="card" style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--color-text-muted)" }}>Workflow Version</div>
          <div style={{ fontWeight: 800, fontSize: 28 }}>{workflow.workflowVersion}</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Last action {formatDateTime(workflow.lastWorkflowActionAt || workflow.lastDetectedAt)}</div>
        </div>
      </div>

      {actionError ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{actionError}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="section-header">
          <span className="section-header__text">Quick Actions</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {workflow.allowedActions.map((actionType) => (
            <button
              key={actionType}
              className={actionType === "RESOLVE" || actionType === "MARK_ATTENDANCE" || actionType === "COMPLETE_GRADING" || actionType === "BULK_GRADE" ? "button" : "button secondary"}
              type="button"
              style={{ width: "auto" }}
              onClick={() => openDialog(actionType)}
            >
              {ACTION_LABELS[actionType] || actionType}
            </button>
          ))}
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          All actions are optimistic concurrency-safe and append immutable workflow history using workflow version checks.
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="section-header">
          <span className="section-header__text">Execution Preview</span>
        </div>
        <PreviewBlock metadata={workflow.metadata} />
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="section-header">
          <span className="section-header__text">Active Tasks</span>
        </div>
        {tasks.length ? (
          tasks.map((task) => (
            <div key={task.id} style={{ display: "grid", gap: 4, padding: 12, borderRadius: 12, background: "rgba(15, 23, 42, 0.04)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone="info">{task.taskType}</Badge>
                <Badge>{task.state}</Badge>
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Due {formatDateTime(task.dueAt)}</div>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--color-text-muted)" }}>No active tasks are attached to this workflow.</div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div className="section-header">
          <span className="section-header__text">Immutable Timeline</span>
        </div>
        {(historyData.items || []).length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {historyData.items.map((item) => (
              <div key={item.id} style={{ display: "grid", gap: 6, padding: 12, borderRadius: 12, background: "rgba(15, 23, 42, 0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700 }}>{item.actionType}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{formatDateTime(item.createdAt)}</div>
                </div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                  Actor: {item.actorUser?.username || item.actorUser?.email || item.actorRole || "System"}
                </div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                  Status {item.fromStatus || "-"} → {item.toStatus}
                </div>
                {item.reason ? <div style={{ fontSize: 13 }}>Reason: {item.reason}</div> : null}
                {item.notes ? <div style={{ fontSize: 13 }}>Notes: {item.notes}</div> : null}
                {item.metadata ? (
                  <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                    Version {item.expectedVersion} → {item.resultingVersion}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--color-text-muted)" }}>No workflow history is available.</div>
        )}
      </div>

      {dialogAction ? (
        <WorkflowActionDialog
          actionType={dialogAction}
          values={dialogValues}
          availableSubmissions={availableSubmissions}
          busy={busy}
          onChange={(name, value) => setDialogValues((current) => ({ ...current, [name]: value }))}
          onToggleSubmission={(submissionId) => {
            setDialogValues((current) => {
              const currentIds = Array.isArray(current.submissionIds) ? current.submissionIds : [];
              return {
                ...current,
                submissionIds: currentIds.includes(submissionId)
                  ? currentIds.filter((item) => item !== submissionId)
                  : [...currentIds, submissionId]
              };
            });
          }}
          onCancel={() => {
            if (!busy) {
              setDialogAction(null);
              setDialogValues({});
            }
          }}
          onConfirm={handleActionConfirm}
        />
      ) : null}
    </section>
  );
}

export { TeacherWorkflowDetailPage };