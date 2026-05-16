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
import { buildLineChartOptions, getChartPalette, numberTick, percentTick } from "../utils/chart-config";
import { formatCompactNumber, formatPercent } from "../utils/formatters";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const FranchiseStudentGrowthChart = memo(function FranchiseStudentGrowthChart({ resource }) {
  const palette = getChartPalette();

  const chartData = useMemo(() => {
    const series = resource?.series || [];
    return {
      datasets: [
        {
          backgroundColor: "rgba(29, 78, 216, 0.12)",
          borderColor: palette.secondary,
          data: series.map((point) => point.activeStudents),
          fill: true,
          label: "Active students",
          pointHoverRadius: 5,
          pointRadius: 3,
          tension: 0.28
        },
        {
          backgroundColor: palette.accent,
          borderColor: palette.accent,
          data: series.map((point) => point.growthPercent),
          label: "Growth %",
          pointHoverRadius: 4,
          pointRadius: 2,
          tension: 0.28,
          yAxisID: "y1"
        }
      ],
      labels: series.map((point) => point.label)
    };
  }, [palette.accent, palette.secondary, resource?.series]);

  const options = useMemo(
    () =>
      buildLineChartOptions({
        palette,
        formatTooltipValue: numberTick,
        secondaryAxis: {
          formatTooltipValue: (value) => formatPercent(value, { digits: 1 }),
          tickFormatter: percentTick
        }
      }),
    [palette]
  );

  const isEmpty = !resource?.loading && !resource?.error && !resource?.series?.length;

  return (
    <WidgetShell
      title="Student Growth Trend"
      description="Active student movement and growth trend for this franchise, without duplicating the backend admissions or growth calculations in the browser."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="detail" />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No growth trend available"
      emptyDescription="This franchise does not yet have enough student growth points to chart for the selected date range."
    >
      <div className="bpdash-summary-row">
        <div className="bpdash-summary-card">
          <span>Latest active students</span>
          <strong>{formatCompactNumber(resource?.summary?.latestActiveStudents)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Total admissions</span>
          <strong>{formatCompactNumber(resource?.summary?.totalNewAdmissions)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Average growth</span>
          <strong>{formatPercent(resource?.summary?.averageGrowthPercent, { signed: true })}</strong>
        </div>
      </div>
      <div className="bpdash-chart-surface">
        <Line data={chartData} options={options} />
      </div>
    </WidgetShell>
  );
});

export { FranchiseStudentGrowthChart };