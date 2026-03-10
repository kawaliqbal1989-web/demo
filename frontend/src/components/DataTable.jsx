function DataTable({ columns = [], rows = [], keyField = "id" }) {
  const getRowKey = (row, index) => {
    try {
      if (typeof keyField === "function") {
        const k = keyField(row, index);
        if (k !== undefined && k !== null && k !== "") return String(k);
      } else if (typeof keyField === "string" && keyField) {
        const k = row && typeof row === "object" ? row[keyField] : undefined;
        if (k !== undefined && k !== null && k !== "") return String(k);
      }
    } catch {
      // ignore and fall back
    }

    const fallback = row && typeof row === "object" ? row.id : null;
    if (fallback !== undefined && fallback !== null && fallback !== "") return String(fallback);
    return `row-${index}`;
  };

  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: "left",
                  padding: "12px 12px",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap"
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--color-border-divider)",
                    fontSize: 14,
                    whiteSpace: col.wrap ? "normal" : "nowrap"
                  }}
                >
                  {typeof col.render === "function" ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 12, color: "var(--color-text-muted)" }}>
                No results
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PaginationBar({ limit, offset, count, total, onChange }) {
  const prevDisabled = offset <= 0;
  const nextDisabled = typeof total === "number" ? offset + limit >= total : count < limit;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
      <button
        className="button secondary"
        style={{ width: "auto" }}
        disabled={prevDisabled}
        onClick={() => onChange({ limit, offset: Math.max(0, offset - limit) })}
      >
        Prev
      </button>
      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        Offset {offset}{typeof total === "number" ? ` / ${total}` : ""}
      </span>
      <button
        className="button secondary"
        style={{ width: "auto" }}
        disabled={nextDisabled}
        onClick={() => onChange({ limit, offset: offset + limit })}
      >
        Next
      </button>
    </div>
  );
}

export { DataTable, PaginationBar };
