function CenterEnrollmentsPagination({
  rowsCount,
  rosterTotal,
  rosterLoading,
  rosterPage,
  pageSize,
  onPrevPage,
  onNextPage
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--color-text-muted)", marginTop: 6 }}>
      <span>Showing {rowsCount} of {rosterTotal} enrolled students</span>
      <button
        className="button secondary"
        type="button"
        style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
        disabled={rosterLoading || rosterPage === 0}
        onClick={onPrevPage}
      >
        ← Prev
      </button>
      <span>Page {rosterPage + 1} of {Math.max(1, Math.ceil(rosterTotal / pageSize))}</span>
      <button
        className="button secondary"
        type="button"
        style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
        disabled={rosterLoading || (rosterPage + 1) * pageSize >= rosterTotal}
        onClick={onNextPage}
      >
        Next →
      </button>
    </div>
  );
}

export { CenterEnrollmentsPagination };