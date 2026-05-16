import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { useFranchiseRanking } from "../hooks/useFranchiseRanking";
import {
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  getHealthGrade,
  getHealthTone,
  round
} from "../utils/formatters";
import { WidgetShell } from "../components/WidgetShell";
import { TablePagination } from "../components/TablePagination";

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

const FranchiseRankingTable = memo(function FranchiseRankingTable({ filters, refreshTick, franchiseOptions }) {
  const [tableState, setTableState] = useState(DEFAULT_TABLE_STATE);
  const { data, error, loading, retry } = useFranchiseRanking(filters, tableState, { refreshTick });

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    if (!filters.franchiseId) {
      return items;
    }

    return items.filter((item) => item.franchiseId === filters.franchiseId);
  }, [data?.items, filters.franchiseId]);

  const selectedFranchiseLabel = useMemo(
    () => franchiseOptions.find((option) => option.value === filters.franchiseId)?.label || null,
    [filters.franchiseId, franchiseOptions]
  );

  const pagination = filters.franchiseId
    ? { limit: filteredItems.length || 1, offset: 0, returned: filteredItems.length, total: filteredItems.length }
    : data?.pagination;

  const isEmpty = !loading && !error && !filteredItems.length;

  return (
    <WidgetShell
      title="Franchise Ranking"
      description="Server-sorted franchise performance with health score, collections, and student load in one operational table."
      meta={data?.meta}
      hasData={Boolean(data)}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="table" rows={6} cols={6} />}
      error={error && !data ? error : null}
      onRetry={retry}
      isEmpty={isEmpty}
      emptyTitle="No franchise rows available"
      emptyDescription={selectedFranchiseLabel ? `No ranking row matched ${selectedFranchiseLabel} in the current result window.` : "Try widening the date range or refreshing after the next snapshot cycle."}
    >
      {selectedFranchiseLabel ? (
        <div className="bpdash-inline-note">Filtered to franchise: {selectedFranchiseLabel}</div>
      ) : null}
      <div className="bpdash-table-wrap">
        <table className="bpdash-table">
          <thead>
            <tr>
              <th><SortHeader label="Franchise" columnKey="franchiseName" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Students" columnKey="studentCount" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Centers" columnKey="centerCount" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Collections" columnKey="monthlyCollections" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Growth" columnKey="studentGrowthPercent" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
              <th><SortHeader label="Health" columnKey="healthScore" sortBy={tableState.sortBy} sortDirection={tableState.sortDirection} onSort={(column) => setTableState((current) => nextSortState(current, column))} /></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.franchiseId}>
                <td>
                  <div className="bpdash-table__primary">
                    <Link className="bpdash-table__link" to={`/bp/franchises/${item.franchiseId}`}>
                      {item.franchiseName}
                    </Link>
                  </div>
                  <div className="bpdash-table__secondary">{item.franchiseCode || "No code"}</div>
                </td>
                <td>{formatCompactNumber(item.studentCount)}</td>
                <td>{formatCompactNumber(item.centerCount)}</td>
                <td>{formatCurrency(item.monthlyCollections)}</td>
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
          <article key={`mobile-${item.franchiseId}`} className="bpdash-mobile-card">
            <div className="bpdash-mobile-card__header">
              <div>
                <div className="bpdash-table__primary">
                  <Link className="bpdash-table__link" to={`/bp/franchises/${item.franchiseId}`}>
                    {item.franchiseName}
                  </Link>
                </div>
                <div className="bpdash-table__secondary">{item.franchiseCode || "No code"}</div>
              </div>
              <span className={`bpdash-health-badge bpdash-health-badge--${getHealthTone(item.healthScore)}`}>
                {round(item.healthScore, 1)}
              </span>
            </div>
            <div className="bpdash-mobile-card__grid">
              <div><span>Students</span><strong>{formatCompactNumber(item.studentCount)}</strong></div>
              <div><span>Centers</span><strong>{formatCompactNumber(item.centerCount)}</strong></div>
              <div><span>Collections</span><strong>{formatCurrency(item.monthlyCollections)}</strong></div>
              <div><span>Growth</span><strong>{formatPercent(item.studentGrowthPercent, { signed: true })}</strong></div>
            </div>
          </article>
        ))}
      </div>

      {!filters.franchiseId ? (
        <TablePagination
          pagination={pagination}
          onPageChange={(next) => setTableState((current) => ({ ...current, ...next }))}
          disabled={loading}
        />
      ) : null}
    </WidgetShell>
  );
});

export { FranchiseRankingTable };