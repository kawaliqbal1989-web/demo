import { memo, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from "chart.js";
import { Line } from "react-chartjs-2";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { WidgetShell } from "../components/WidgetShell";
import { buildLineChartOptions, getChartPalette } from "../utils/chart-config";
import { formatChartCurrency, formatCurrency, formatPercent } from "../utils/formatters";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const FranchiseRevenueTrendChart = memo(function FranchiseRevenueTrendChart({ resource }) {
  const palette = getChartPalette();

  const chartData = useMemo(() => {
    const series = resource?.series || [];
    return {
      datasets: [
        {
          backgroundColor: "rgba(15, 118, 110, 0.12)",
          borderColor: palette.primary,
          data: series.map((point) => point.revenue),
          fill: true,
          label: "Collections",
          pointHoverRadius: 5,
          pointRadius: 3,
          tension: 0.3
        }
      ],
      labels: series.map((point) => point.label)
    };
  }, [palette.primary, resource?.series]);

  const options = useMemo(
    () => buildLineChartOptions({ palette, formatTooltipValue: formatChartCurrency }),
    [palette]
  );

  const isEmpty = !resource?.loading && !resource?.error && !resource?.series?.length;

  return (
    <WidgetShell
      title="Revenue Trend"
      description="Collections for this franchise over the active date window, preserving snapshot/live source labeling and backend trend logic."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="detail" />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No franchise revenue trend available"
      emptyDescription="This franchise does not yet have revenue points for the selected date range."
    >
      <div className="bpdash-summary-row">
        <div className="bpdash-summary-card">
          <span>Total revenue</span>
          <strong>{formatCurrency(resource?.summary?.totalRevenue)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Average revenue</span>
          <strong>{formatCurrency(resource?.summary?.averageRevenue)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Growth</span>
          <strong>{formatPercent(resource?.summary?.growthPercent, { signed: true })}</strong>
        </div>
      </div>
      <div className="bpdash-chart-surface">
        <Line data={chartData} options={options} />
      </div>
    </WidgetShell>
  );
});

export { FranchiseRevenueTrendChart };