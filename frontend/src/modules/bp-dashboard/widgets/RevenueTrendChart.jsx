import { memo, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Line } from "react-chartjs-2";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { useRevenueTrend } from "../hooks/useRevenueTrend";
import { buildLineChartOptions, getChartPalette } from "../utils/chart-config";
import { formatChartCurrency, formatCurrency, formatPercent } from "../utils/formatters";
import { WidgetShell } from "../components/WidgetShell";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const RevenueTrendChart = memo(function RevenueTrendChart({ filters, refreshTick }) {
  const { data, error, loading, retry } = useRevenueTrend(filters, { refreshTick });
  const palette = getChartPalette();

  const chartData = useMemo(() => {
    const series = data?.series || [];
    return {
      datasets: [
        {
          backgroundColor: "rgba(15, 118, 110, 0.12)",
          borderColor: palette.primary,
          data: series.map((point) => point.revenue),
          fill: true,
          label: "Monthly collections",
          pointHoverRadius: 5,
          pointRadius: 3,
          tension: 0.3
        }
      ],
      labels: series.map((point) => point.label)
    };
  }, [data, palette.primary]);

  const options = useMemo(
    () => buildLineChartOptions({ palette, formatTooltipValue: formatChartCurrency }),
    [palette]
  );

  const isEmpty = !loading && !error && !(data?.series || []).length;

  return (
    <WidgetShell
      title="Revenue Trend"
      description="Snapshot-backed monthly collections, shaped for quick trend reading rather than a finance workbench."
      meta={data?.meta}
      hasData={Boolean(data)}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="detail" />}
      error={error && !data ? error : null}
      onRetry={retry}
      isEmpty={isEmpty}
      emptyTitle="No revenue trend available"
      emptyDescription="This range does not yet have revenue trend points. Try a wider window or refresh after the next analytics job finishes."
    >
      <div className="bpdash-summary-row">
        <div className="bpdash-summary-card">
          <span>Total</span>
          <strong>{formatCurrency(data?.summary?.totalRevenue)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Average</span>
          <strong>{formatCurrency(data?.summary?.averageRevenue)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Growth</span>
          <strong>{formatPercent(data?.summary?.growthPercent, { signed: true })}</strong>
        </div>
      </div>
      <div className="bpdash-chart-surface">
        <Line data={chartData} options={options} />
      </div>
    </WidgetShell>
  );
});

export default RevenueTrendChart;