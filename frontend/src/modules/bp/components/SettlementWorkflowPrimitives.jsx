function humanizeWorkflowToken(value) {
  if (!value) {
    return "-";
  }

  return String(value)
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatWorkflowDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatWorkflowDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function formatWorkflowCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amount);
}

function getWorkflowScopeLabel({ franchise, center } = {}) {
  const franchiseLabel = franchise?.displayName || franchise?.name || franchise?.code || null;
  const centerLabel = center?.displayName || center?.name || center?.code || null;

  if (franchiseLabel && centerLabel) {
    return `${franchiseLabel} / ${centerLabel}`;
  }

  return centerLabel || franchiseLabel || "Business Partner Scope";
}

function getWorkflowBadgeTone(value, tone) {
  if (tone) {
    return tone;
  }

  const normalized = String(value || "").toUpperCase();
  if (["PAID", "APPROVED", "REVIEWED", "RESOLVED", "COMPLETED", "ACTIVE"].includes(normalized)) {
    return "success";
  }

  if (["ESCALATED", "OVERDUE", "HIGH", "CRITICAL", "ACKNOWLEDGED", "PENDING_REVIEW"].includes(normalized)) {
    return "warning";
  }

  if (["REJECTED", "FAILED", "CANCELLED"].includes(normalized)) {
    return "danger";
  }

  if (["BP", "FRANCHISE", "CENTER", "SUBMIT", "REVIEW", "APPROVE", "RESOLVE"].includes(normalized)) {
    return "info";
  }

  return "neutral";
}

function WorkflowBadge({ value, tone }) {
  const resolvedTone = getWorkflowBadgeTone(value, tone);
  const palette = {
    neutral: {
      background: "var(--color-bg-badge)",
      color: "var(--color-text-primary)"
    },
    info: {
      background: "rgba(37, 99, 235, 0.12)",
      color: "#1d4ed8"
    },
    success: {
      background: "var(--color-bg-success-light)",
      color: "var(--color-text-success)"
    },
    warning: {
      background: "var(--color-bg-warn-light)",
      color: "var(--color-text-warning)"
    },
    danger: {
      background: "var(--color-bg-danger-light)",
      color: "var(--color-text-danger)"
    }
  };

  const colors = palette[resolvedTone] || palette.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
        background: colors.background,
        color: colors.color,
        whiteSpace: "nowrap"
      }}
    >
      {humanizeWorkflowToken(value)}
    </span>
  );
}

function DetailRow({ label, value, children }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </span>
      <div style={{ fontWeight: 600 }}>{children ?? value ?? "-"}</div>
    </div>
  );
}

function JsonPreview({ value }) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.06)",
        overflowX: "auto",
        fontSize: 12
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function isActiveEscalation(escalation) {
  return ["ACTIVE", "ACKNOWLEDGED"].includes(String(escalation?.state || "").toUpperCase());
}

export {
  DetailRow,
  JsonPreview,
  WorkflowBadge,
  formatWorkflowCurrency,
  formatWorkflowDate,
  formatWorkflowDateTime,
  getWorkflowScopeLabel,
  humanizeWorkflowToken,
  isActiveEscalation
};