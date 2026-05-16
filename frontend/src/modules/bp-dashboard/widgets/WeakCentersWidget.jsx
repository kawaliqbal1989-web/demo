import { memo, useMemo } from "react";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { WidgetShell } from "../components/WidgetShell";
import {
  formatCurrency,
  formatPercent,
  getHealthTone,
  round
} from "../utils/formatters";
import { filterCenterRows, getCenterOperationalStatus } from "./franchise-detail.shared";

const WeakCentersWidget = memo(function WeakCentersWidget({ resource, selectedCenterOption = null }) {
  const items = useMemo(() => {
    const filtered = filterCenterRows(resource?.items || [], { selectedCenterOption });
    return [...filtered]
      .sort((left, right) => {
        const healthDiff = (left?.healthScore || 0) - (right?.healthScore || 0);
        if (healthDiff !== 0) {
          return healthDiff;
        }
        return (right?.pendingFees || 0) - (left?.pendingFees || 0);
      })
      .slice(0, 5);
  }, [resource?.items, selectedCenterOption]);

  const isEmpty = !resource?.loading && !resource?.error && !items.length;

  return (
    <WidgetShell
      title="Weak Centers"
      description="Centers that need intervention first, prioritized by weak health score and revenue pressure."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="table" rows={4} cols={3} />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No weak centers flagged"
      emptyDescription="No center rows are available to assess operational weakness right now."
    >
      <div className="bpdash-compact-list">
        {items.map((item) => {
          const status = getCenterOperationalStatus(item);

          return (
            <article key={item.centerId} className="bpdash-compact-list__item">
              <div>
                <div className="bpdash-table__primary">{item.centerName}</div>
                <div className="bpdash-table__secondary">{formatPercent(item.attendancePercent)} attendance • {status.label}</div>
              </div>
              <div className="bpdash-compact-list__meta">
                <span className={`bpdash-health-badge bpdash-health-badge--${getHealthTone(item.healthScore)}`}>{round(item.healthScore, 1)}</span>
                <strong>{formatCurrency(item.pendingFees)}</strong>
              </div>
            </article>
          );
        })}
      </div>
    </WidgetShell>
  );
});

export { WeakCentersWidget };