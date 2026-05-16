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
import { useStudentGrowthTrend } from "../hooks/useStudentGrowthTrend";
import { buildLineChartOptions, getChartPalette, numberTick, percentTick } from "../utils/chart-config";
import { formatCompactNumber, formatPercent } from "../utils/formatters";
import { WidgetShell } from "../components/WidgetShell";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const StudentGrowthChart = memo(function StudentGrowthChart({ filters, refreshTick }) {
  const { data, error, loading, retry } = useStudentGrowthTrend(filters, { refreshTick });
  const palette = getChartPalette();

  const chartData = useMemo(() => {
    const series = data?.series || [];
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
  }, [data, palette.accent, palette.secondary]);

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

  const isEmpty = !loading && !error && !(data?.series || []).length;

  return (
    <WidgetShell
      title="Student Growth Trend"
      description="Track active student movement and admissions momentum without duplicating backend analytics logic in the browser."
      meta={data?.meta}
      hasData={Boolean(data)}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="detail" />}
      error={error && !data ? error : null}
      onRetry={retry}
      isEmpty={isEmpty}
      emptyTitle="No student growth trend available"
      emptyDescription="This range does not yet have enough student snapshot points to chart."
    >
      <div className="bpdash-summary-row">
        <div className="bpdash-summary-card">
          <span>Latest active students</span>
          <strong>{formatCompactNumber(data?.summary?.latestActiveStudents)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Admissions in window</span>
          <strong>{formatCompactNumber(data?.summary?.totalNewAdmissions)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Average growth</span>
          <strong>{formatPercent(data?.summary?.averageGrowthPercent, { signed: true })}</strong>
        </div>
      </div>
      <div className="bpdash-chart-surface">
        <Line data={chartData} options={options} />
      </div>
    </WidgetShell>
  );
});

export default StudentGrowthChart;