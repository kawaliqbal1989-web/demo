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
  filtersOpen,
  refreshing,
  onPageSizeChange,
  onToggleCompact,
  onOpenFilters,
  onRefresh,
  onCreate
}) {
  return (
    <div className="batch-toolbar card">
      <div className="batch-toolbar__primary">
        <label className="batch-toolbar__search">
          <span className="batch-toolbar__label">Search batches</span>
          <input
            className="input"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by batch, teacher, level, or schedule"
          />
        </label>

        <button className="button batch-toolbar__create" type="button" onClick={onCreate}>
          New Batch
        </button>
      </div>

      <div className="batch-toolbar__row">
        <button className="button secondary batch-toolbar__filters-toggle" type="button" onClick={onOpenFilters}>
          {filtersOpen ? "Hide Filters" : "Filters"}{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>

        <label className="batch-toolbar__page-size">
          <span className="batch-toolbar__label">Rows</span>
          <select className="select" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <button className="button secondary" type="button" onClick={onToggleCompact}>
          {compact ? "Comfortable" : "Compact"}
        </button>

        <button className="button secondary" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="batch-toolbar__meta">
        <span>{formatResultRange(page, pageSize, total, count)}</span>
        <span>{activeFilterCount ? `${activeFilterCount} active filters` : "No active filters"}</span>
        <span>{refreshing ? "Updating live results..." : "Server-side pagination and sorting"}</span>
      </div>
    </div>
  );
}

export { BatchCatalogToolbar };