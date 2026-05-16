function BatchStatusBadge({ status }) {
  const normalized = String(status || "UNKNOWN").toUpperCase();

  const palette = {
    ACTIVE: { background: "var(--color-bg-success-light)", color: "var(--color-text-success)", border: "var(--color-border-success-light)" },
    UPCOMING: { background: "var(--color-bg-info-light)", color: "var(--color-text-info)", border: "var(--color-primary-ring)" },
    PAUSED: { background: "var(--color-bg-warn-light)", color: "var(--color-text-warning)", border: "rgba(217,119,6,0.18)" },
    TRIAL: { background: "var(--batch-trial-bg)", color: "var(--batch-trial-text)", border: "var(--batch-trial-border)" },
    COMPLETED: { background: "var(--color-bg-muted)", color: "var(--color-text-secondary)", border: "var(--color-border)" },
    ARCHIVED: { background: "var(--batch-archived-bg)", color: "var(--batch-archived-text)", border: "var(--batch-archived-border)" }
  };

  const tone = palette[normalized] || { background: "var(--color-bg-badge)", color: "var(--color-text-primary)", border: "var(--color-border)" };

  return (
    <span className="batch-chip" style={{ background: tone.background, color: tone.color, borderColor: tone.border }}>
      {normalized}
    </span>
  );
}

export { BatchStatusBadge };