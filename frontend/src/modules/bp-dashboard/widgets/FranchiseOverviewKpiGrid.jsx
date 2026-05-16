import { memo, useMemo } from "react";
import { MetricCard } from "../../../components/MetricCard";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { WidgetShell } from "../components/WidgetShell";
import { formatMetricDelta, formatMetricValue, round } from "../utils/formatters";

const KPI_ORDER = [
  { key: "totalStudents", icon: "🎓" },
  { key: "activeStudents", icon: "🟢" },
  { key: "totalCenters", icon: "🏫" },
  { key: "activeCenters", icon: "📍" },
  { key: "totalRevenue", icon: "💰" },
  { key: "pendingFees", icon: "🧾" },
  { key: "admissionsThisMonth", icon: "✨" },
  { key: "growthPercent", icon: "📈" },
  { key: "healthScore", icon: "🛡️" }
];

const FranchiseOverviewKpiGrid = memo(function FranchiseOverviewKpiGrid({ resource }) {
  const metrics = useMemo(
    () =>
      KPI_ORDER.map((config) => {
        const metric = resource?.data?.kpis?.[config.key] || null;
        return {
          ...config,
          metric,
          subtitle: metric ? formatMetricDelta(metric) : "",
          trend: metric ? round(metric.deltaPercent, 1) : null,
          value: formatMetricValue(metric)
        };
      }),
    [resource?.data?.kpis]
  );

  const isEmpty = !resource?.loading && !resource?.error && !metrics.some((item) => item.metric);

  return (
    <WidgetShell
      title="Franchise Overview"
      description="The operating KPIs a BP lead checks first for a single franchise: student load, center footprint, revenue pressure, admissions, and health."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="card" count={9} />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No franchise KPI data yet"
      emptyDescription="This franchise does not have a KPI snapshot or live fallback payload for the current date window yet."
      className="bpdash-widget--flat"
    >
      <div className="bpdash-kpi-grid">
        {metrics.map((item) => (
          <MetricCard
            key={item.key}
            label={item.metric?.label || item.key}
            value={item.value}
            icon={item.icon}
            trend={item.trend}
            sublabel={item.subtitle}
          />
        ))}
      </div>
    </WidgetShell>
  );
});

export { FranchiseOverviewKpiGrid };