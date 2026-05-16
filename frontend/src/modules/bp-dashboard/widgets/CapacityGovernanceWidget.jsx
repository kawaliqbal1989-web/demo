import { useEffect, useMemo, useState } from "react";
import { MetricCard } from "../../../components/MetricCard";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { useAuth } from "../../../hooks/useAuth";
import { getBpCenterCapacitySummary } from "../../../services/capacityService";
import { deriveCenterCapacityStatus } from "../../../utils/capacityGovernance";
import { WidgetShell } from "../components/WidgetShell";

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) {
    return "--";
  }

  return `${Number(value).toFixed(1)}%`;
}

function CapacityGovernanceWidget({ filters, refreshTick }) {
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState("all");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!["BP", "SUPERADMIN"].includes(role)) {
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await getBpCenterCapacitySummary({
          limit: 200,
          offset: 0,
          sortBy: "maxUtilizationPercent",
          sortDirection: "desc",
          franchiseId: filters?.franchiseId || undefined,
          centerId: filters?.centerId || undefined
        });

        if (!cancelled) {
          setData(response?.data ?? null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filters?.centerId, filters?.franchiseId, refreshTick, reloadTick, role]);

  const items = useMemo(() => {
    const sourceItems = Array.isArray(data?.items) ? data.items : [];

    return sourceItems.map((item) => ({
      ...item,
      displayStatus: deriveCenterCapacityStatus(item)
    }));
  }, [data]);

  const filteredItems = useMemo(() => {
    if (stateFilter === "all") {
      return items;
    }

    return items.filter((item) => item.displayStatus.key === stateFilter);
  }, [items, stateFilter]);

  const totals = useMemo(
    () => ({
      totalStudents: items.reduce((sum, item) => sum + Number(item.studentsUsed || 0), 0),
      totalTeachers: items.reduce((sum, item) => sum + Number(item.teachersUsed || 0), 0),
      nearLimitCount: items.filter((item) => item.displayStatus.key === "warning").length,
      criticalCount: items.filter((item) => ["critical", "locked"].includes(item.displayStatus.key)).length
    }),
    [items]
  );

  const isEmpty = !loading && !error && filteredItems.length === 0;

  if (!["BP", "SUPERADMIN"].includes(role)) {
    return null;
  }

  return (
    <WidgetShell
      title="Capacity governance"
      description="Operational view of governed center limits, with warning and critical states derived from live teacher and student utilization."
      meta={data?.meta}
      hasData={Boolean(data)}
      loading={loading}
      loadingFallback={<SkeletonLoader variant="table" rows={4} />}
      error={error}
      onRetry={() => setReloadTick((current) => current + 1)}
      isEmpty={isEmpty}
      emptyTitle="No governed centers found"
      emptyDescription="No center capacity records match the current BP filters yet."
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={`button secondary ${stateFilter === "all" ? "capacity-filter-button--active" : ""}`.trim()} style={{ width: "auto" }} onClick={() => setStateFilter("all")}>
            All centers
          </button>
          <button className={`button secondary ${stateFilter === "warning" ? "capacity-filter-button--active" : ""}`.trim()} style={{ width: "auto" }} onClick={() => setStateFilter("warning")}>
            Near limit
          </button>
          <button className={`button secondary ${stateFilter === "critical" ? "capacity-filter-button--active" : ""}`.trim()} style={{ width: "auto" }} onClick={() => setStateFilter("critical")}>
            Critical only
          </button>
          <button className={`button secondary ${stateFilter === "locked" ? "capacity-filter-button--active" : ""}`.trim()} style={{ width: "auto" }} onClick={() => setStateFilter("locked")}>
            Locked only
          </button>
        </div>
      }
    >
      <div className="capacity-summary-grid">
        <MetricCard label="Total students" value={totals.totalStudents.toLocaleString()} accent="var(--role-bp)" />
        <MetricCard label="Total teachers" value={totals.totalTeachers.toLocaleString()} accent="#0f766e" />
        <MetricCard label="Centers near limit" value={totals.nearLimitCount.toLocaleString()} accent="#d97706" />
        <MetricCard label="Critical centers" value={totals.criticalCount.toLocaleString()} accent="#dc2626" />
      </div>

      <div className="capacity-table-wrap">
        <table className="capacity-table">
          <thead>
            <tr>
              <th>Center Name</th>
              <th>Students Used / Limit</th>
              <th>Teachers Used / Limit</th>
              <th>Usage %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.centerId}>
                <td>
                  <div className="capacity-table__center-name">{item.centerName}</div>
                  {item.franchiseName ? <div className="capacity-table__subtext">{item.franchiseName}</div> : null}
                </td>
                <td>{`${item.studentsUsed} / ${item.studentLimit}`}</td>
                <td>{`${item.teachersUsed} / ${item.teacherLimit}`}</td>
                <td>{formatPercent(item.maxUtilizationPercent)}</td>
                <td>
                  <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                    <span className={`capacity-status-badge capacity-status-badge--${item.displayStatus.key}`}>{item.displayStatus.label}</span>
                    <span className="capacity-table__subtext">{item.recommendedAction}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetShell>
  );
}

export { CapacityGovernanceWidget };