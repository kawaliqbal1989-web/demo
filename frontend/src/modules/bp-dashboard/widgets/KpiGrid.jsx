import { memo, useMemo } from "react";
import { MetricCard } from "../../../components/MetricCard";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { useDashboardOverview } from "../hooks/useDashboardOverview";
import { formatMetricDelta, formatMetricValue, round } from "../utils/formatters";
import { WidgetShell } from "../components/WidgetShell";

const KPI_ORDER = [
  { key: "totalStudents", icon: "🎓" },
  { key: "activeStudents", icon: "🟢" },
  { key: "totalFranchises", icon: "🏢" },
  { key: "activeCenters", icon: "🏫" },
  { key: "monthlyCollections", icon: "💰" },
  { key: "pendingFees", icon: "🧾" },
  { key: "newAdmissions", icon: "✨" },
  { key: "studentGrowthPercent", icon: "📈" }
];

const KpiGrid = memo(function KpiGrid({ filters, refreshTick }) {
  const { data, error, loading, retry } = useDashboardOverview(filters, { refreshTick });

  const metrics = useMemo(
    () =>
      KPI_ORDER.map((config) => {
        const metric = data?.kpis?.[config.key] || null;
        return {
          ...config,
          metric,
          subtitle: metric ? formatMetricDelta(metric) : "",
          trend: metric ? round(metric.deltaPercent, 1) : null,
          value: formatMetricValue(metric)
        };
      }),
    [data]
  );

  const isEmpty = !loading && !error && !metrics.some((item) => item.metric);

  return (
    <WidgetShell
      title="Network KPI Overview"
      description="The top-line metrics a BP operator checks first: student load, network breadth, collections, and admissions momentum."
      meta={data?.meta}
      hasData={Boolean(data)}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="card" count={8} />}
      error={error && !data ? error : null}
      onRetry={retry}
      isEmpty={isEmpty}
      emptyTitle="No KPI data yet"
      emptyDescription="The current date window does not have dashboard metrics yet. Try a newer date range or refresh after the next snapshot cycle."
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

export { KpiGrid };