import { PAGE_SIZE_OPTIONS } from "./batchCatalog.constants";
import { formatResultRange } from "./batchCatalog.helpers";

function BatchCatalogToolbar({
  searchInput,
  onSearchChange,
  page,
  pageSize,
  total,
  count,
  compact,
  activeFilterCount,
  refreshing,
  onPageSizeChange,
  onToggleCompact,
  onOpenFilters,
  onRefresh,
  onCreate
}) {
  return (
    <div className="batch-toolbar card">
      <div className="batch-toolbar__row">
        <label className="batch-toolbar__search">
          <span className="batch-toolbar__label">Search</span>
          <input
            className="input"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Batch, teacher, or level"
          />
        </label>

        <label className="batch-toolbar__page-size">
          <span className="batch-toolbar__label">Rows</span>
          <select className="select" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <button className="button secondary batch-toolbar__filters-toggle" type="button" onClick={onOpenFilters}>
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>

        <button className="button secondary" type="button" onClick={onToggleCompact}>
          {compact ? "Comfortable" : "Compact"}
        </button>

        <button className="button secondary" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>

        <button className="button" type="button" onClick={onCreate}>
          New Batch
        </button>
      </div>

      <div className="batch-toolbar__meta">
        <span>{formatResultRange(page, pageSize, total, count)}</span>
        <span>{refreshing ? "Updating live results..." : "Server-side pagination and sorting"}</span>
      </div>
    </div>
  );
}

export { BatchCatalogToolbar };