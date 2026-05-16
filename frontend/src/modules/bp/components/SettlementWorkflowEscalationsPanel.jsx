import {
  JsonPreview,
  WorkflowBadge,
  formatWorkflowDateTime,
  getWorkflowScopeLabel
} from "./SettlementWorkflowPrimitives";

function getElapsedLabel(value) {
  if (!value) {
    return "-";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "-";
  }

  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const elapsedDays = Math.floor(elapsedHours / 24);

  if (elapsedDays > 0) {
    return `${elapsedDays}d ${elapsedHours % 24}h`;
  }

  return `${elapsedHours}h`;
}

function isEscalationOverdue(escalation) {
  const triggeredAt = new Date(escalation?.triggeredAt || escalation?.createdAt || 0).getTime();
  if (Number.isNaN(triggeredAt)) {
    return false;
  }

  const isActive = !String(escalation?.state || "").toUpperCase().includes("RESOLVED");
  return isActive && Date.now() - triggeredAt >= 1000 * 60 * 60 * 24;
}

function isTaskOverdue(task) {
  const dueAt = new Date(task?.dueAt || 0).getTime();
  if (Number.isNaN(dueAt)) {
    return false;
  }

  return dueAt < Date.now();
}

function SettlementWorkflowEscalationsPanel({ escalations = [], tasks = [] }) {
  const activeTasks = tasks.filter((task) => !["COMPLETED", "RESOLVED", "CANCELLED"].includes(String(task.state || "").toUpperCase()));

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Escalations</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
            Active and resolved workflow escalations for this settlement.
          </div>
        </div>

        {escalations.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)" }}>No escalations recorded.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {escalations.map((escalation) => (
              <article
                key={escalation.id}
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid var(--color-border)",
                  background: "rgba(245, 158, 11, 0.08)"
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <WorkflowBadge value={escalation.escalationType} tone="warning" />
                  <WorkflowBadge value={escalation.severity} tone="warning" />
                  <WorkflowBadge value={escalation.state} tone={String(escalation.state || "").toUpperCase() === "RESOLVED" ? "success" : "warning"} />
                  {isEscalationOverdue(escalation) ? <WorkflowBadge value="OVERDUE" tone="danger" /> : null}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <span>
                    <strong>Scope:</strong> {getWorkflowScopeLabel({ franchise: escalation.franchise, center: escalation.center })}
                  </span>
                  <span>
                    <strong>Triggered:</strong> {formatWorkflowDateTime(escalation.triggeredAt || escalation.createdAt)}
                  </span>
                  <span>
                    <strong>Age:</strong> {getElapsedLabel(escalation.triggeredAt || escalation.createdAt)}
                  </span>
                  <span>
                    <strong>Resolved:</strong> {formatWorkflowDateTime(escalation.resolvedAt)}
                  </span>
                  <span>
                    <strong>Reason:</strong> {escalation.escalationReason || "-"}
                  </span>
                </div>

                <JsonPreview value={escalation.metadata} />
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Workflow Tasks</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
            Open queue tasks and downstream work created by transitions.
          </div>
        </div>

        {activeTasks.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)" }}>No active tasks for this workflow.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {activeTasks.map((task) => (
              <article
                key={task.id}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid var(--color-border)",
                  background: "rgba(37, 99, 235, 0.06)"
                }}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <WorkflowBadge value={task.taskType} tone="info" />
                  <WorkflowBadge value={task.state} tone="info" />
                  <WorkflowBadge value={task.targetRole} tone="info" />
                  {isTaskOverdue(task) ? <WorkflowBadge value="OVERDUE" tone="danger" /> : null}
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <span>
                    <strong>Assignee:</strong> {task.targetUser?.username || task.targetUser?.email || task.targetUserId || task.targetRole || "Unassigned"}
                  </span>
                  <span>
                    <strong>Due:</strong> {formatWorkflowDateTime(task.dueAt)}
                  </span>
                  <span>
                    <strong>Age:</strong> {getElapsedLabel(task.createdAt || task.updatedAt || task.dueAt)}
                  </span>
                  <span>
                    <strong>Scope:</strong> {getWorkflowScopeLabel({ franchise: task.franchise, center: task.center })}
                  </span>
                </div>

                <JsonPreview value={task.metadata} />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export { SettlementWorkflowEscalationsPanel };