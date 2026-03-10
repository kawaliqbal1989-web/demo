function MetricCard({ label, value, sublabel }) {
  return (
    <div className="card" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sublabel ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{sublabel}</div> : null}
    </div>
  );
}

export { MetricCard };
