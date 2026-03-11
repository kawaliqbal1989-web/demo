import { useMemo, useState, useCallback, memo } from "react";

const DataTable = memo(function DataTable({
  columns = [],
  rows = [],
  keyField = "id",
  searchable = false,
  searchPlaceholder = "Search…",
  toolbar,
  emptyMessage = "No results",
  onSort,
  sortKey,
  sortDir,
  // V3: Row selection
  selectable = false,
  selectedKeys,
  onSelectionChange,
  // V3: Bulk action toolbar (shown when rows selected)
  bulkActions,
  // V3: Column visibility
  columnVisibility,
  onColumnVisibilityChange,
  // V3: Advanced filters
  filters,
  onFilterChange,
}) {
  const [query, setQuery] = useState("");
  const [showColumnPicker, setShowColumnPicker] = useState(false);

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
      // ignore
    }
    const fallback = row && typeof row === "object" ? row.id : null;
    if (fallback !== undefined && fallback !== null && fallback !== "") return String(fallback);
    return `row-${index}`;
  };

  const visibleColumns = useMemo(() => {
    if (!columnVisibility) return columns;
    return columns.filter((col) => columnVisibility[col.key] !== false);
  }, [columns, columnVisibility]);

  const filteredRows = useMemo(() => {
    let result = rows;

    // Client-side search
    if (searchable && query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = typeof col.render === "function" ? null : row[col.key];
          return val != null && String(val).toLowerCase().includes(q);
        })
      );
    }

    // Advanced filters
    if (filters && onFilterChange) {
      for (const [key, value] of Object.entries(filters)) {
        if (value === "" || value === undefined || value === null) continue;
        result = result.filter((row) => {
          const cell = row[key];
          if (cell == null) return false;
          return String(cell).toLowerCase().includes(String(value).toLowerCase());
        });
      }
    }

    return result;
  }, [rows, query, searchable, columns, filters, onFilterChange]);

  // V3: Selection helpers
  const allKeys = useMemo(() => filteredRows.map((row, i) => getRowKey(row, i)), [filteredRows]);
  const selectedSet = useMemo(() => new Set(selectedKeys || []), [selectedKeys]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedSet.has(k));
  const someSelected = allKeys.some((k) => selectedSet.has(k));
  const selectionCount = allKeys.filter((k) => selectedSet.has(k)).length;

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(allKeys);
    }
  }, [allSelected, allKeys, onSelectionChange]);

  const handleSelectRow = useCallback(
    (key) => {
      if (!onSelectionChange) return;
      const newKeys = selectedSet.has(key)
        ? [...selectedSet].filter((k) => k !== key)
        : [...selectedSet, key];
      onSelectionChange(newKeys);
    },
    [selectedSet, onSelectionChange]
  );

  const showToolbar = searchable || toolbar || (selectable && selectionCount > 0) || filters;
  const showBulkBar = selectable && selectionCount > 0 && bulkActions;

  // Column filter inputs
  const filterColumns = useMemo(
    () => columns.filter((c) => c.filterable),
    [columns]
  );

  return (
    <div className="data-table-wrap" style={{ overflowX: "auto" }}>
      {/* Bulk action bar */}
      {showBulkBar && (
        <div className="data-table__bulk-bar">
          <span className="data-table__bulk-count">{selectionCount} selected</span>
          <div className="data-table__bulk-actions">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                className={`button ${action.variant || "secondary"} data-table__bulk-btn`}
                onClick={() => action.onClick([...selectedSet])}
                disabled={action.disabled}
              >
                {action.icon && <span className="data-table__bulk-icon">{action.icon}</span>}
                {action.label}
              </button>
            ))}
          </div>
          <button className="data-table__bulk-clear" onClick={() => onSelectionChange([])}>
            Clear selection
          </button>
        </div>
      )}

      {showToolbar && (
        <div className="data-table__toolbar">
          {searchable && (
            <div className="data-table__search-wrap">
              <svg className="data-table__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="data-table__search"
                type="text"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          {/* Advanced filter dropdowns */}
          {filterColumns.length > 0 && onFilterChange && (
            <div className="data-table__filters">
              {filterColumns.map((col) => (
                <select
                  key={col.key}
                  className="data-table__filter-select"
                  value={filters?.[col.key] || ""}
                  onChange={(e) => onFilterChange({ ...filters, [col.key]: e.target.value })}
                >
                  <option value="">{col.header}: All</option>
                  {(col.filterOptions || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ))}
            </div>
          )}

          {/* Column visibility toggle */}
          {onColumnVisibilityChange && (
            <div className="data-table__colpicker-wrap">
              <button
                className="data-table__colpicker-btn"
                onClick={() => setShowColumnPicker((v) => !v)}
                title="Toggle columns"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              {showColumnPicker && (
                <div className="data-table__colpicker-dropdown">
                  {columns.map((col) => (
                    <label key={col.key} className="data-table__colpicker-item">
                      <input
                        type="checkbox"
                        checked={columnVisibility?.[col.key] !== false}
                        onChange={(e) =>
                          onColumnVisibilityChange({
                            ...columnVisibility,
                            [col.key]: e.target.checked,
                          })
                        }
                      />
                      {col.header}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {toolbar}
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            {selectable && (
              <th className="data-table__check-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={handleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
            )}
            {visibleColumns.map((col) => {
              const isSortable = col.sortable && onSort;
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  data-sortable={isSortable || undefined}
                  aria-sort={isSorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  onClick={isSortable ? () => onSort(col.key) : undefined}
                >
                  {col.header}
                  {isSortable && (
                    <span className="sort-icon">
                      {isSorted ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row, index) => {
            const rowKey = getRowKey(row, index);
            const isSelected = selectedSet.has(rowKey);
            return (
              <tr key={rowKey} className={isSelected ? "data-table__row--selected" : undefined}>
                {selectable && (
                  <td className="data-table__check-col">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(rowKey)}
                      aria-label={`Select row ${rowKey}`}
                    />
                  </td>
                )}
                {visibleColumns.map((col) => (
                  <td key={col.key} className={col.wrap ? "wrap" : undefined}>
                    {typeof col.render === "function" ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
          {!filteredRows.length && (
            <tr>
              <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="data-table__empty">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
)

const PaginationBar = memo(function PaginationBar({ limit, offset, count, total, onChange }) {
  const prevDisabled = offset <= 0;
  const nextDisabled = typeof total === "number" ? offset + limit >= total : count < limit;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = typeof total === "number" ? Math.ceil(total / limit) : null;

  return (
    <div className="pagination-bar">
      <button disabled={prevDisabled} onClick={() => onChange({ limit, offset: Math.max(0, offset - limit) })}>
        ← Prev
      </button>
      <span>
        Page {page}{totalPages ? ` of ${totalPages}` : ""}{typeof total === "number" ? ` · ${total} rows` : ""}
      </span>
      <button disabled={nextDisabled} onClick={() => onChange({ limit, offset: offset + limit })}>
        Next →
      </button>
    </div>
  );
});

// V3: Saved Views hook — persists filter/sort/column state to localStorage
function useSavedViews(viewKey) {
  const storageKey = `dt-views-${viewKey}`;

  const [views, setViews] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch {
      return [];
    }
  });

  const saveView = useCallback(
    (name, state) => {
      const newView = { id: Date.now().toString(), name, state, createdAt: new Date().toISOString() };
      const updated = [...views, newView];
      setViews(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return newView;
    },
    [views, storageKey]
  );

  const deleteView = useCallback(
    (id) => {
      const updated = views.filter((v) => v.id !== id);
      setViews(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    },
    [views, storageKey]
  );

  return { views, saveView, deleteView };
}

// V3: SavedViewBar component
function SavedViewBar({ viewKey, currentState, onApply }) {
  const { views, saveView, deleteView } = useSavedViews(viewKey);
  const [showSave, setShowSave] = useState(false);
  const [viewName, setViewName] = useState("");

  const handleSave = () => {
    if (!viewName.trim()) return;
    saveView(viewName.trim(), currentState);
    setViewName("");
    setShowSave(false);
  };

  if (!viewKey) return null;

  return (
    <div className="saved-view-bar">
      <div className="saved-view-bar__views">
        {views.map((v) => (
          <div key={v.id} className="saved-view-chip">
            <button className="saved-view-chip__name" onClick={() => onApply(v.state)}>
              {v.name}
            </button>
            <button className="saved-view-chip__delete" onClick={() => deleteView(v.id)} title="Delete view">×</button>
          </div>
        ))}
      </div>
      {showSave ? (
        <div className="saved-view-bar__save-form">
          <input
            type="text"
            className="saved-view-bar__input"
            placeholder="View name…"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <button className="button primary saved-view-bar__save-btn" onClick={handleSave}>Save</button>
          <button className="button secondary saved-view-bar__cancel-btn" onClick={() => setShowSave(false)}>Cancel</button>
        </div>
      ) : (
        <button className="saved-view-bar__add" onClick={() => setShowSave(true)}>
          + Save View
        </button>
      )}
    </div>
  );
}

export { DataTable, PaginationBar, SavedViewBar, useSavedViews };
