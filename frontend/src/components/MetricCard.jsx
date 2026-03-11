function MetricCard({ label, value, sublabel, icon, trend, trendLabel, accent }) {
  const accentStyle = accent ? { "--metric-accent": accent } : undefined;

  return (
    <div className="card metric-card-v2" style={accentStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div className="metric-card-v2__label">{label}</div>
        {icon ? <div className="metric-card-v2__icon">{icon}</div> : null}
      </div>
      <div className="metric-card-v2__value">{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {trend != null ? (
          <span className={`metric-card-v2__trend ${trend >= 0 ? "metric-card-v2__trend--up" : "metric-card-v2__trend--down"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        ) : null}
        {sublabel || trendLabel ? (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{trendLabel || sublabel}</span>
        ) : null}
      </div>
    </div>
  );
}

export { MetricCard };
