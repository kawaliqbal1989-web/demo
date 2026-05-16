import { memo, useMemo, useState } from "react";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { TablePagination } from "../components/TablePagination";
import { WidgetShell } from "../components/WidgetShell";
import {
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  getHealthGrade,
  getHealthTone,
  round
} from "../utils/formatters";
import {
  CENTER_STATUS_OPTIONS,
  DEFAULT_CENTER_TABLE_STATE,
  filterCenterRows,
  getCenterOperationalStatus,
  nextSortState,
  paginateCenterRows,
  sortCenterRows
} from "./franchise-detail.shared";

function SortHeader({ label, columnKey, sortBy, sortDirection, onSort }) {
  const isActive = sortBy === columnKey;
  return (
    <button className="bpdash-table__sort" onClick={() => onSort(columnKey)}>
      {label}
      <span>{isActive ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}</span>
    </button>
  );
}

const FranchiseCenterBreakdownTable = memo(function FranchiseCenterBreakdownTable({
  resource,
  selectedCenterOption = null,
  initialTableState = DEFAULT_CENTER_TABLE_STATE
}) {
  const [tableState, setTableState] = useState(initialTableState);

  const filteredItems = useMemo(
    () =>
      filterCenterRows(resource?.items || [], {
        query: tableState.query,
        selectedCenterOption,
        statusFilter: tableState.statusFilter
      }),
    [resource?.items, selectedCenterOption, tableState.query, tableState.statusFilter]
  );

  const sortedItems = useMemo(
    () => sortCenterRows(filteredItems, tableState),
    [filteredItems, tableState]
  );

  const paged = useMemo(
    () => paginateCenterRows(sortedItems, tableState),
    [sortedItems, tableState]
  );

  const hasPartialCoverage = (resource?.pagination?.total || 0) > (resource?.items?.length || 0);
  const isEmpty = !resource?.loading && !resource?.error && !filteredItems.length;

  return (
    <WidgetShell
      title="Center Breakdown"
      description="Center-level operations for this franchise with client-side filtering, responsive row rendering, and WidgetShell-safe loading/error states."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="table" rows={6} cols={8} />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No center rows available"
      emptyDescription={selectedCenterOption ? `No center-health row matched ${selectedCenterOption.label} for the current date window.` : "No center rows are available for this franchise yet."}
    >
      <div className="bpdash-toolbar">
        <label className="bpdash-toolbar__field">
          <span className="bpdash-filters__label">Search</span>
          <input
            className="input"
            placeholder="Search center"
            value={tableState.query}
            onChange={(event) =>
              setTableState((current) => ({
                ...current,
                offset: 0,
                query: event.target.value
              }))
            }
          />
        </label>
        <label className="bpdash-toolbar__field">
          <span className="bpdash-filters__label">Status</span>
          <select
            className="input"
            value={tableState.statusFilter}
            onChange={(event) =>
              setTableState((current) => ({
                ...current,
                offset: 0,
                statusFilter: event.target.value
              }))
            }
          >
            {CENTER_STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedCenterOption ? <div className="bpdash-inline-note">Filtered to center: {selectedCenterOption.label}</div> : null}
      {hasPartialCoverage ? (
        <div className="bpdash-inline-note">Showing the first {resource?.items?.length || 0} centers loaded for this franchise. Narrow the date window if you need a smaller operational slice.</div>
      ) : null}

      <div className="bpdash-table-wrap">
        <table className="bpdash-table">
          <thead>
            <tr>
              <th><SortHeader label="Center" columnKey="centerName" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Students" columnKey="activeStudents" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Attendance" columnKey="attendancePercent" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Revenue" columnKey="monthlyRevenue" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Pending" columnKey="pendingFees" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Growth" columnKey="studentGrowthPercent" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Health" columnKey="healthScore" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.items.map((item) => {
              const status = getCenterOperationalStatus(item);

              return (
                <tr key={item.centerId}>
                  <td>
                    <div className="bpdash-table__primary">{item.centerName}</div>
                    <div className="bpdash-table__secondary">{item.centerCode || item.franchiseName || "Unassigned"}</div>
                  </td>
                  <td>{formatCompactNumber(item.activeStudents)}</td>
                  <td>{formatPercent(item.attendancePercent)}</td>
                  <td>{formatCurrency(item.monthlyRevenue)}</td>
                  <td>{formatCurrency(item.pendingFees)}</td>
                  <td>{formatPercent(item.studentGrowthPercent, { signed: true })}</td>
                  <td>
                    <span className={`bpdash-health-badge bpdash-health-badge--${getHealthTone(item.healthScore)}`}>
                      {getHealthGrade(item.healthScore)} {round(item.healthScore, 1)}
                    </span>
                  </td>
                  <td>
                    <span className={`bpdash-status-pill bpdash-status-pill--${status.tone}`}>{status.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bpdash-mobile-list">
        {paged.items.map((item) => {
          const status = getCenterOperationalStatus(item);

          return (
            <article key={`mobile-${item.centerId}`} className="bpdash-mobile-card">
              <div className="bpdash-mobile-card__header">
                <div>
                  <div className="bpdash-table__primary">{item.centerName}</div>
                  <div className="bpdash-table__secondary">{item.centerCode || item.franchiseName || "Unassigned"}</div>
                </div>
                <span className={`bpdash-health-badge bpdash-health-badge--${getHealthTone(item.healthScore)}`}>
                  {round(item.healthScore, 1)}
                </span>
              </div>
              <div className="bpdash-mobile-card__grid">
                <div><span>Students</span><strong>{formatCompactNumber(item.activeStudents)}</strong></div>
                <div><span>Attendance</span><strong>{formatPercent(item.attendancePercent)}</strong></div>
                <div><span>Revenue</span><strong>{formatCurrency(item.monthlyRevenue)}</strong></div>
                <div><span>Pending</span><strong>{formatCurrency(item.pendingFees)}</strong></div>
                <div><span>Growth</span><strong>{formatPercent(item.studentGrowthPercent, { signed: true })}</strong></div>
                <div><span>Status</span><strong>{status.label}</strong></div>
              </div>
            </article>
          );
        })}
      </div>

      <TablePagination
        pagination={paged.pagination}
        onPageChange={(next) => setTableState((current) => ({ ...current, ...next }))}
        disabled={resource?.loading}
      />
    </WidgetShell>
  );
});

export { FranchiseCenterBreakdownTable };