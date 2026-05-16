import { memo, useMemo } from "react";
import { MetricCard } from "../../../components/MetricCard";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { WidgetShell } from "../components/WidgetShell";
import { formatCompactNumber, formatPercent, round } from "../utils/formatters";
import { getAverageAttendance, getLoadedCenterCoverage } from "./franchise-detail.shared";

const TeacherStudentActivitySummaryWidget = memo(function TeacherStudentActivitySummaryWidget({
  centersResource,
  growthResource,
  overviewResource
}) {
  const metrics = useMemo(() => {
    const teacherMetric = overviewResource?.data?.kpis?.teacherCount || null;
    const activeStudentsMetric = overviewResource?.data?.kpis?.activeStudents || null;
    const averageAttendance = getAverageAttendance(centersResource?.items || []);
    const admissionsThisMonth = overviewResource?.data?.kpis?.admissionsThisMonth || null;

    return [
      {
        icon: "👩‍🏫",
        key: "teacherCount",
        label: teacherMetric?.label || "Teacher count",
        value: teacherMetric ? formatCompactNumber(teacherMetric.value) : "--"
      },
      {
        icon: "🎓",
        key: "activeStudents",
        label: activeStudentsMetric?.label || "Active students",
        value: activeStudentsMetric ? formatCompactNumber(activeStudentsMetric.value) : "--"
      },
      {
        icon: "📝",
        key: "worksheetParticipation",
        label: "Worksheet participation",
        trendLabel: "Not surfaced in the current BP payload",
        value: "--"
      },
      {
        icon: "🧪",
        key: "examParticipation",
        label: "Exam participation",
        trendLabel: "Not surfaced in the current BP payload",
        value: "--"
      },
      {
        icon: "📅",
        key: "attendanceOverview",
        label: "Attendance overview",
        trend: averageAttendance != null ? round(averageAttendance - 75, 1) : null,
        value: averageAttendance != null ? formatPercent(averageAttendance) : "--"
      },
      {
        icon: "📍",
        key: "centersReporting",
        label: "Centers reporting",
        trendLabel: `${growthResource?.series?.length || 0} trend points in window`,
        value: getLoadedCenterCoverage(centersResource?.items || [], centersResource?.pagination)
      },
      {
        icon: "✨",
        key: "admissionsThisMonth",
        label: admissionsThisMonth?.label || "Admissions this month",
        value: admissionsThisMonth ? formatCompactNumber(admissionsThisMonth.value) : "--"
      }
    ];
  }, [centersResource?.items, centersResource?.pagination, growthResource?.series?.length, overviewResource?.data?.kpis]);

  const loading = overviewResource?.loading || centersResource?.loading || growthResource?.loading;
  const error = overviewResource?.error || centersResource?.error || growthResource?.error;
  const hasData = overviewResource?.hasData || centersResource?.hasData || growthResource?.hasData;
  const retry = overviewResource?.retry || centersResource?.retry || growthResource?.retry;
  const isEmpty = !loading && !error && !metrics.some((item) => item.value && item.value !== "--");

  return (
    <WidgetShell
      title="Teacher And Student Activity"
      description="A lightweight operating summary derived from the existing franchise overview, student trend, and center analytics payloads."
      meta={overviewResource?.meta || growthResource?.meta || centersResource?.meta}
      hasData={hasData}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="card" count={6} />}
      error={error}
      onRetry={retry}
      isEmpty={isEmpty}
      emptyTitle="No activity summary available"
      emptyDescription="Activity summary metrics are not available for this franchise yet."
    >
      <div className="bpdash-activity-grid">
        {metrics.map((item) => (
          <MetricCard
            key={item.key}
            accent={item.accent}
            icon={item.icon}
            label={item.label}
            sublabel={item.sublabel}
            trend={item.trend}
            trendLabel={item.trendLabel}
            value={item.value}
          />
        ))}
      </div>
    </WidgetShell>
  );
});

export { TeacherStudentActivitySummaryWidget };