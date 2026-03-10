function StatusBadge({ value }) {
  const text = String(value || "UNKNOWN").toUpperCase();

  let background = "var(--color-bg-badge)";
  let color = "var(--color-text-primary)";

  if (text === "ACTIVE") {
    background = "var(--color-bg-success-light)";
    color = "var(--color-text-success)";
  }

  if (text === "SUSPENDED") {
    background = "var(--color-bg-warn-light)";
    color = "var(--color-text-warning)";
  }

  if (text === "EXPIRED" || text === "REJECTED") {
    background = "var(--color-bg-danger-light)";
    color = "var(--color-text-danger)";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background,
        color
      }}
    >
      {text}
    </span>
  );
}

export { StatusBadge };
