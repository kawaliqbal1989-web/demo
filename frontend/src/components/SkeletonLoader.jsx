/**
 * SkeletonLoader — content-shaped loading placeholder.
 *
 * Variants:
 *  - "card"       → metric-card shaped placeholder
 *  - "table"      → table with rows
 *  - "detail"     → title + paragraph lines
 *  - "list"       → repeated single-line rows
 *
 * Usage:
 *  <SkeletonLoader variant="card" count={4} />
 *  <SkeletonLoader variant="table" rows={5} />
 */

function SkeletonLine({ width = "100%", height = 12 }) {
  return (
    <div
      className="ds2-skeleton"
      style={{ width, height, borderRadius: 6 }}
      aria-hidden="true"
    />
  );
}

function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <SkeletonLine width="40%" height={10} />
      <SkeletonLine width="55%" height={28} />
      <SkeletonLine width="30%" height={10} />
    </div>
  );
}

function SkeletonTableRow({ cols = 4 }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} style={{ padding: "12px" }}>
          <SkeletonLine width={i === 0 ? "70%" : "50%"} height={12} />
        </td>
      ))}
    </tr>
  );
}

function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }} aria-hidden="true">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} style={{ padding: "12px" }}>
                <SkeletonLine width="60%" height={10} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <SkeletonLine width="50%" height={22} />
      <SkeletonLine width="100%" />
      <SkeletonLine width="90%" />
      <SkeletonLine width="75%" />
      <div style={{ height: 8 }} />
      <SkeletonLine width="100%" />
      <SkeletonLine width="60%" />
    </div>
  );
}

function SkeletonList({ rows = 4 }) {
  return (
    <div className="card" style={{ display: "grid", gap: 14, padding: 18 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="ds2-skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "grid", gap: 6 }}>
            <SkeletonLine width="60%" height={12} />
            <SkeletonLine width="40%" height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonLoader({ variant = "card", count = 1, rows, cols }) {
  if (variant === "table") return <SkeletonTable rows={rows || 5} cols={cols || 4} />;
  if (variant === "detail") return <SkeletonDetail />;
  if (variant === "list") return <SkeletonList rows={rows || 4} />;

  if (count === 1) return <SkeletonCard />;

  return (
    <div className="dash-kpi-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export { SkeletonLoader, SkeletonLine };
