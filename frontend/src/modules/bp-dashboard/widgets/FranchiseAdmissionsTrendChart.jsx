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
import { buildLineChartOptions, getChartPalette, numberTick } from "../utils/chart-config";
import { formatCompactNumber } from "../utils/formatters";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const FranchiseAdmissionsTrendChart = memo(function FranchiseAdmissionsTrendChart({ resource }) {
  const palette = getChartPalette();

  const chartData = useMemo(() => {
    const series = resource?.series || [];
    return {
      datasets: [
        {
          backgroundColor: "rgba(234, 88, 12, 0.14)",
          borderColor: palette.accent,
          data: series.map((point) => point.newAdmissions),
          fill: true,
          label: "New admissions",
          pointHoverRadius: 5,
          pointRadius: 3,
          tension: 0.3
        }
      ],
      labels: series.map((point) => point.label)
    };
  }, [palette.accent, resource?.series]);

  const options = useMemo(
    () => buildLineChartOptions({ palette, formatTooltipValue: numberTick }),
    [palette]
  );

  const isEmpty = !resource?.loading && !resource?.error && !resource?.series?.length;

  return (
    <WidgetShell
      title="Admissions Trend"
      description="Admissions is rendered from the same franchise student-growth payload to keep the frontend aligned with the existing analytics surface."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="detail" />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No admissions trend available"
      emptyDescription="This franchise does not yet have admissions points in the selected window."
    >
      <div className="bpdash-summary-row">
        <div className="bpdash-summary-card">
          <span>Total admissions</span>
          <strong>{formatCompactNumber(resource?.summary?.totalNewAdmissions)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Latest active students</span>
          <strong>{formatCompactNumber(resource?.summary?.latestActiveStudents)}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Window points</span>
          <strong>{formatCompactNumber(resource?.series?.length)}</strong>
        </div>
      </div>
      <div className="bpdash-chart-surface">
        <Line data={chartData} options={options} />
      </div>
    </WidgetShell>
  );
});

export { FranchiseAdmissionsTrendChart };