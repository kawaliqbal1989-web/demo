import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "../../../components/ErrorState";
import { PageHeader } from "../../../components/PageHeader";
import { useAuth } from "../../../hooks/useAuth";
import { DashboardFilters } from "../components/DashboardFilters";
import { useDashboardFilterOptions } from "../hooks/useDashboardFilterOptions";
import { useDashboardFilters } from "../hooks/useDashboardFilters";
import { useFranchiseAlerts } from "../hooks/useFranchiseAlerts";
import { useFranchiseCenters } from "../hooks/useFranchiseCenters";
import { useFranchiseOverview } from "../hooks/useFranchiseOverview";
import { useFranchiseRevenueTrend } from "../hooks/useFranchiseRevenueTrend";
import { useFranchiseStudentGrowth } from "../hooks/useFranchiseStudentGrowth";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { clearBpDashboardClientCache } from "../services/bp-dashboard.api";
import {
  buildDashboardSearchParams,
  filterCenterOptionsByFranchise,
  normalizeDashboardFilters
} from "../utils/filters";
import { FranchiseAdmissionsTrendChart } from "../widgets/FranchiseAdmissionsTrendChart";
import { FranchiseCenterBreakdownTable } from "../widgets/FranchiseCenterBreakdownTable";
import { FranchiseOverviewKpiGrid } from "../widgets/FranchiseOverviewKpiGrid";
import { FranchiseRevenueTrendChart } from "../widgets/FranchiseRevenueTrendChart";
import { FranchiseStudentGrowthChart } from "../widgets/FranchiseStudentGrowthChart";
import { OperationalAlertsWidget } from "../widgets/OperationalAlertsWidget";
import { TeacherStudentActivitySummaryWidget } from "../widgets/TeacherStudentActivitySummaryWidget";
import { TopPerformingCentersWidget } from "../widgets/TopPerformingCentersWidget";
import { WeakCentersWidget } from "../widgets/WeakCentersWidget";
import { ALL_CENTERS_RESOURCE_STATE } from "../widgets/franchise-detail.shared";

function BPFranchiseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { branding } = useAuth();
  const { appliedFilters, draftFilters, resetFilters, updateFilter } = useDashboardFilters();
  const { centers, error: filterError, franchises, loading: optionsLoading, retry: retryOptions } = useDashboardFilterOptions();
  const { isOnline } = useNetworkStatus();
  const [refreshTick, setRefreshTick] = useState(0);

  const franchiseId = useMemo(() => String(id || "").trim(), [id]);

  useEffect(() => {
    if (franchiseId && draftFilters.franchiseId !== franchiseId) {
      updateFilter("franchiseId", franchiseId);
    }
  }, [draftFilters.franchiseId, franchiseId, updateFilter]);

  const detailDraftFilters = useMemo(
    () => ({
      ...draftFilters,
      franchiseId
    }),
    [draftFilters, franchiseId]
  );

  const detailAppliedFilters = useMemo(
    () =>
      normalizeDashboardFilters({
        ...appliedFilters,
        franchiseId
      }),
    [appliedFilters, franchiseId]
  );

  const selectedFranchise = useMemo(
    () => franchises.find((option) => option.value === franchiseId) || null,
    [franchiseId, franchises]
  );
  const filteredCenterOptions = useMemo(
    () => filterCenterOptionsByFranchise(centers, selectedFranchise?.nodeId || null),
    [centers, selectedFranchise?.nodeId]
  );
  const selectedCenterOption = useMemo(
    () => filteredCenterOptions.find((option) => option.value === detailDraftFilters.centerId) || null,
    [detailDraftFilters.centerId, filteredCenterOptions]
  );

  useEffect(() => {
    if (!detailDraftFilters.centerId) {
      return;
    }

    const stillVisible = filteredCenterOptions.some((option) => option.value === detailDraftFilters.centerId);
    if (!stillVisible) {
      updateFilter("centerId", "");
    }
  }, [detailDraftFilters.centerId, filteredCenterOptions, updateFilter]);

  const overviewResource = useFranchiseOverview(franchiseId, detailAppliedFilters, { refreshTick });
  const revenueResource = useFranchiseRevenueTrend(franchiseId, detailAppliedFilters, { refreshTick });
  const growthResource = useFranchiseStudentGrowth(franchiseId, detailAppliedFilters, { refreshTick });
  const alertsResource = useFranchiseAlerts(franchiseId, detailAppliedFilters, { refreshTick });
  const centersResource = useFranchiseCenters(franchiseId, detailAppliedFilters, ALL_CENTERS_RESOURCE_STATE, { refreshTick });

  const handleRefresh = () => {
    clearBpDashboardClientCache();
    setRefreshTick((current) => current + 1);
  };

  const handleFilterChange = (key, value) => {
    if (key === "franchiseId") {
      const nextFranchiseId = value || franchiseId;
      const nextFilters = normalizeDashboardFilters({
        ...detailDraftFilters,
        centerId: "",
        franchiseId: nextFranchiseId
      });
      navigate(`/bp/franchises/${nextFranchiseId}?${buildDashboardSearchParams(nextFilters).toString()}`);
      return;
    }

    updateFilter(key, value);
  };

  const handleReset = () => {
    clearBpDashboardClientCache();
    resetFilters();
  };

  if (!franchiseId) {
    return <ErrorState title="Franchise route unavailable" message="A valid franchise id is required to open this operational view." />;
  }

  return (
    <section className="bpdash-page bpdash-franchise-page">
      <PageHeader
        title={selectedFranchise?.label || "Franchise Operational Intelligence"}
        subtitle={branding?.displayName || branding?.name || "Operational franchise intelligence with snapshot-first resilience and safe live fallback behavior."}
        actions={
          <div className="bpdash-header-actions">
            <Link className="button secondary" style={{ width: "auto" }} to="/bp/franchises">
              Back To Franchises
            </Link>
            <button className="button" style={{ width: "auto" }} onClick={handleRefresh}>
              Refresh Franchise View
            </button>
          </div>
        }
      >
        <div className="bpdash-page__meta">
          Route-locked operational dashboard for one franchise. Date filters drive trends and overview metrics while the center filter narrows the center widgets without changing BP scope.
        </div>
      </PageHeader>

      {!isOnline ? (
        <div className="bpdash-banner bpdash-banner--warning" role="status">
          You are offline. Any already-loaded franchise data stays visible and retry remains safe when the connection returns.
        </div>
      ) : null}

      {filterError ? (
        <ErrorState
          title="Franchise filters unavailable"
          message="The franchise detail page can still render, but filter options could not be refreshed."
          onRetry={retryOptions}
          retryLabel="Retry filters"
        />
      ) : null}

      <DashboardFilters
        filters={detailDraftFilters}
        franchiseOptions={franchises}
        centerOptions={filteredCenterOptions}
        optionsLoading={optionsLoading}
        onFilterChange={handleFilterChange}
        onRefresh={handleRefresh}
        onReset={handleReset}
      />

      <div className="bpdash-banner bpdash-banner--info" role="status">
        This page reuses the existing BP dashboard hooks and WidgetShell patterns. Student Growth and Admissions charts share the same analytics payload to avoid duplicate backend work.
      </div>

      <FranchiseOverviewKpiGrid resource={overviewResource} />

      <div className="bpdash-detail-chart-grid">
        <FranchiseRevenueTrendChart resource={revenueResource} />
        <FranchiseStudentGrowthChart resource={growthResource} />
        <FranchiseAdmissionsTrendChart resource={growthResource} />
      </div>

      <div className="bpdash-detail-insight-grid">
        <OperationalAlertsWidget resource={alertsResource} />
        <TeacherStudentActivitySummaryWidget
          centersResource={centersResource}
          growthResource={growthResource}
          overviewResource={overviewResource}
        />
      </div>

      <div className="bpdash-detail-center-grid">
        <FranchiseCenterBreakdownTable resource={centersResource} selectedCenterOption={selectedCenterOption} />
        <div className="bpdash-detail-side-stack">
          <TopPerformingCentersWidget resource={centersResource} selectedCenterOption={selectedCenterOption} />
          <WeakCentersWidget resource={centersResource} selectedCenterOption={selectedCenterOption} />
        </div>
      </div>
    </section>
  );
}

export { BPFranchiseDetailPage };