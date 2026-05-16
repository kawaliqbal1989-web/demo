import { memo, useMemo } from "react";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { WidgetShell } from "../components/WidgetShell";
import {
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  getHealthTone,
  round
} from "../utils/formatters";
import { filterCenterRows } from "./franchise-detail.shared";

const TopPerformingCentersWidget = memo(function TopPerformingCentersWidget({ resource, selectedCenterOption = null }) {
  const items = useMemo(() => {
    const filtered = filterCenterRows(resource?.items || [], { selectedCenterOption });
    return [...filtered]
      .sort((left, right) => {
        const healthDiff = (right?.healthScore || 0) - (left?.healthScore || 0);
        if (healthDiff !== 0) {
          return healthDiff;
        }
        return (right?.monthlyRevenue || 0) - (left?.monthlyRevenue || 0);
      })
      .slice(0, 5);
  }, [resource?.items, selectedCenterOption]);

  const isEmpty = !resource?.loading && !resource?.error && !items.length;

  return (
    <WidgetShell
      title="Top Performing Centers"
      description="The healthiest centers in the franchise right now, prioritized by health score and collections."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="table" rows={4} cols={3} />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No top centers available"
      emptyDescription="There are no center rows available to rank yet."
    >
      <div className="bpdash-compact-list">
        {items.map((item) => (
          <article key={item.centerId} className="bpdash-compact-list__item">
            <div>
              <div className="bpdash-table__primary">{item.centerName}</div>
              <div className="bpdash-table__secondary">{formatCompactNumber(item.activeStudents)} students • {formatPercent(item.attendancePercent)} attendance</div>
            </div>
            <div className="bpdash-compact-list__meta">
              <span className={`bpdash-health-badge bpdash-health-badge--${getHealthTone(item.healthScore)}`}>{round(item.healthScore, 1)}</span>
              <strong>{formatCurrency(item.monthlyRevenue)}</strong>
            </div>
          </article>
        ))}
      </div>
    </WidgetShell>
  );
});

export { TopPerformingCentersWidget };