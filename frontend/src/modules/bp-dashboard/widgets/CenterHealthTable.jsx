import { memo, useMemo, useState } from "react";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { useCenterHealth } from "../hooks/useCenterHealth";
import { TablePagination } from "../components/TablePagination";
import { WidgetShell } from "../components/WidgetShell";
import { centerOptionMatchesItem } from "../utils/filters";
import {
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  getHealthGrade,
  getHealthTone,
  round
} from "../utils/formatters";

const DEFAULT_TABLE_STATE = {
  limit: 8,
  offset: 0,
  sortBy: "healthScore",
  sortDirection: "desc"
};

function nextSortState(current, sortBy) {
  if (current.sortBy !== sortBy) {
    return { ...current, offset: 0, sortBy, sortDirection: "desc" };
  }

  return {
    ...current,
    offset: 0,
    sortDirection: current.sortDirection === "desc" ? "asc" : "desc"
  };
}

function SortHeader({ label, columnKey, sortBy, sortDirection, onSort }) {
  const isActive = sortBy === columnKey;
  return (
    <button className="bpdash-table__sort" onClick={() => onSort(columnKey)}>
      {label}
      <span>{isActive ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}</span>
    </button>
  );
}

const CenterHealthTable = memo(function CenterHealthTable({ filters, refreshTick, centerOptions }) {
  const [tableState, setTableState] = useState(DEFAULT_TABLE_STATE);
  const { data, error, loading, retry } = useCenterHealth(filters, tableState, { refreshTick });

  const selectedCenterOption = useMemo(
    () => centerOptions.find((option) => option.value === filters.centerId) || null,
    [centerOptions, filters.centerId]
  );

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    if (!selectedCenterOption) {
      return items;
    }

    return items.filter((item) => centerOptionMatchesItem(selectedCenterOption, item));
  }, [data?.items, selectedCenterOption]);

  const pagination = selectedCenterOption
    ? { limit: filteredItems.length || 1, offset: 0, returned: filteredItems.length, total: filteredItems.length }
    : data?.pagination;

  const isEmpty = !loading && !error && !filteredItems.length;

  return (
    <WidgetShell
      title="Center Health"
      description="Monitor attendance, revenue, pending fees, teacher coverage, and health score without leaving the BP scope boundary."
      meta={data?.meta}
      hasData={Boolean(data)}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="table" rows={6} cols={7} />}
      error={error && !data ? error : null}
      onRetry={retry}
      isEmpty={isEmpty}
      emptyTitle="No center rows available"
      emptyDescription={selectedCenterOption ? `No current center-health row matched ${selectedCenterOption.label}. Clear the center filter or widen the date range.` : "Try a different franchise filter or refresh after the next snapshot cycle."}
    >
      {selectedCenterOption ? (
        <div className="bpdash-inline-note">Filtered to center: {selectedCenterOption.label}</div>
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
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.centerId}>
                <td>
                  <div className="bpdash-table__primary">{item.centerName}</div>
                  <div className="bpdash-table__secondary">{item.franchiseName || item.centerCode || "Unassigned"}</div>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bpdash-mobile-list">
        {filteredItems.map((item) => (
          <article key={`mobile-${item.centerId}`} className="bpdash-mobile-card">
            <div className="bpdash-mobile-card__header">
              <div>
                <div className="bpdash-table__primary">{item.centerName}</div>
                <div className="bpdash-table__secondary">{item.franchiseName || item.centerCode || "Unassigned"}</div>
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
            </div>
          </article>
        ))}
      </div>

      {!selectedCenterOption ? (
        <TablePagination
          pagination={pagination}
          onPageChange={(next) => setTableState((current) => ({ ...current, ...next }))}
          disabled={loading}
        />
      ) : null}
    </WidgetShell>
  );
});

export { CenterHealthTable };