function TablePagination({ pagination, onPageChange, disabled = false }) {
  const total = pagination?.total || 0;
  const limit = pagination?.limit || 10;
  const offset = pagination?.offset || 0;
  const returned = pagination?.returned || 0;
  const start = total === 0 ? 0 : offset + 1;
  const end = total === 0 ? 0 : offset + returned;
  const canGoBack = offset > 0;
  const canGoForward = offset + returned < total;

  return (
    <div className="bpdash-pagination">
      <div className="bpdash-pagination__summary">
        Showing {start}-{end} of {total}
      </div>
      <div className="bpdash-pagination__actions">
        <button
          className="button secondary"
          style={{ width: "auto" }}
          disabled={disabled || !canGoBack}
          onClick={() => onPageChange({ limit, offset: Math.max(0, offset - limit) })}
        >
          Previous
        </button>
        <button
          className="button secondary"
          style={{ width: "auto" }}
          disabled={disabled || !canGoForward}
          onClick={() => onPageChange({ limit, offset: offset + limit })}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export { TablePagination };