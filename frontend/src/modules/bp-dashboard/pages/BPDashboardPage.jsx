import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { ErrorState } from "../../../components/ErrorState";
import { PageHeader } from "../../../components/PageHeader";
import { ReportActionButtons } from "../../../components/ReportActionButtons";
import { useAuth } from "../../../hooks/useAuth";
import { DashboardFilters } from "../components/DashboardFilters";
import { useDashboardFilterOptions } from "../hooks/useDashboardFilterOptions";
import { useDashboardFilters } from "../hooks/useDashboardFilters";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { clearBpDashboardClientCache } from "../services/bp-dashboard.api";
import { filterCenterOptionsByFranchise } from "../utils/filters";
import { CapacityGovernanceWidget } from "../widgets/CapacityGovernanceWidget";
import { CenterHealthTable } from "../widgets/CenterHealthTable";
import { FranchiseRankingTable } from "../widgets/FranchiseRankingTable";
import { KpiGrid } from "../widgets/KpiGrid";

const RevenueTrendChart = lazy(() => import("../widgets/RevenueTrendChart"));
const StudentGrowthChart = lazy(() => import("../widgets/StudentGrowthChart"));

function BPDashboardPage() {
  const { branding } = useAuth();
  const { appliedFilters, draftFilters, resetFilters, updateFilter } = useDashboardFilters();
  const { centers, error: filterError, franchises, loading: optionsLoading, retry: retryOptions } = useDashboardFilterOptions();
  const { isOnline } = useNetworkStatus();
  const [refreshTick, setRefreshTick] = useState(0);

  const selectedFranchise = useMemo(
    () => franchises.find((option) => option.value === draftFilters.franchiseId) || null,
    [draftFilters.franchiseId, franchises]
  );
  const filteredCenterOptions = useMemo(
    () => filterCenterOptionsByFranchise(centers, selectedFranchise?.nodeId || null),
    [centers, selectedFranchise?.nodeId]
  );

  useEffect(() => {
    if (!draftFilters.centerId) {
      return;
    }

    const stillVisible = filteredCenterOptions.some((option) => option.value === draftFilters.centerId);
    if (!stillVisible) {
      updateFilter("centerId", "");
    }
  }, [draftFilters.centerId, filteredCenterOptions, updateFilter]);

  const handleRefresh = () => {
    clearBpDashboardClientCache();
    setRefreshTick((current) => current + 1);
  };

  return (
    <section className="bpdash-page">
      <PageHeader
        title="Business Partner Analytics"
        subtitle={branding?.displayName || branding?.name || "Snapshot-first network visibility for franchises, centers, students, and collections."}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ReportActionButtons reportKey="bp-operational" params={appliedFilters?.dateTo ? { asOf: appliedFilters.dateTo } : {}} />
            <button className="button" style={{ width: "auto" }} onClick={handleRefresh}>
              Refresh Dashboard
            </button>
          </div>
        }
      >
        <div className="bpdash-page__meta">
          Phase 1 dashboard: KPI overview, trends, ranking, and center-health monitoring without a heavy client state stack.
        </div>
      </PageHeader>

      {!isOnline ? (
        <div className="bpdash-banner bpdash-banner--warning" role="status">
          You are offline. The dashboard keeps any loaded data visible and will retry safely once the connection returns.
        </div>
      ) : null}

      {filterError ? (
        <ErrorState
          title="Dashboard filters unavailable"
          message="The dashboard can still render, but franchise and center filter options could not be loaded."
          onRetry={retryOptions}
          retryLabel="Retry filters"
        />
      ) : null}

      <DashboardFilters
        filters={draftFilters}
        franchiseOptions={franchises}
        centerOptions={filteredCenterOptions}
        optionsLoading={optionsLoading}
        onFilterChange={updateFilter}
        onRefresh={handleRefresh}
        onReset={() => {
          clearBpDashboardClientCache();
          resetFilters();
        }}
      />

      <div className="bpdash-banner bpdash-banner--info" role="status">
        Date range applies across the dashboard. Franchise and center filters currently refine ranking and center-health widgets where the Phase 1 API surface supports it.
      </div>

      <KpiGrid filters={appliedFilters} refreshTick={refreshTick} />

      <CapacityGovernanceWidget filters={appliedFilters} refreshTick={refreshTick} />

      <div className="bpdash-chart-grid">
        <Suspense fallback={<div className="card bpdash-widget">Loading revenue trend...</div>}>
          <RevenueTrendChart filters={appliedFilters} refreshTick={refreshTick} />
        </Suspense>
        <Suspense fallback={<div className="card bpdash-widget">Loading student growth trend...</div>}>
          <StudentGrowthChart filters={appliedFilters} refreshTick={refreshTick} />
        </Suspense>
      </div>

      <FranchiseRankingTable filters={appliedFilters} refreshTick={refreshTick} franchiseOptions={franchises} />
      <CenterHealthTable filters={appliedFilters} refreshTick={refreshTick} centerOptions={filteredCenterOptions} />
    </section>
  );
}

export { BPDashboardPage };