import { SearchableDropdown } from "../../../components/SearchableDropdown";

function DashboardFilters({
  filters,
  franchiseOptions,
  centerOptions,
  optionsLoading = false,
  onFilterChange,
  onRefresh,
  onReset
}) {
  const franchiseDropdownOptions = [{ value: "", label: "All franchises" }, ...franchiseOptions];
  const centerDropdownOptions = [{ value: "", label: "All centers" }, ...centerOptions];

  return (
    <div className="card bpdash-filters">
      <div className="bpdash-filters__header">
        <div>
          <h3 className="bpdash-filters__title">Analytics Filters</h3>
          <p className="bpdash-filters__subtitle">
            Date filters update KPIs and charts. Franchise and center filters narrow table widgets for this phase.
          </p>
        </div>
        <div className="bpdash-filters__actions">
          <button className="button secondary" style={{ width: "auto" }} onClick={onReset}>
            Reset
          </button>
          <button className="button" style={{ width: "auto" }} onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      <div className="bpdash-filters__grid">
        <label className="bpdash-filters__field">
          <span className="bpdash-filters__label">From</span>
          <input
            className="input"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => onFilterChange("dateFrom", event.target.value)}
          />
        </label>

        <label className="bpdash-filters__field">
          <span className="bpdash-filters__label">To</span>
          <input
            className="input"
            type="date"
            value={filters.dateTo}
            onChange={(event) => onFilterChange("dateTo", event.target.value)}
          />
        </label>

        <label className="bpdash-filters__field">
          <span className="bpdash-filters__label">Franchise</span>
          <SearchableDropdown
            options={franchiseDropdownOptions}
            value={filters.franchiseId}
            onChange={(value) => onFilterChange("franchiseId", value)}
            placeholder={optionsLoading ? "Loading franchises..." : "Select franchise"}
            disabled={optionsLoading}
          />
        </label>

        <label className="bpdash-filters__field">
          <span className="bpdash-filters__label">Center</span>
          <SearchableDropdown
            options={centerDropdownOptions}
            value={filters.centerId}
            onChange={(value) => onFilterChange("centerId", value)}
            placeholder={optionsLoading ? "Loading centers..." : "Select center"}
            disabled={optionsLoading}
          />
        </label>
      </div>
    </div>
  );
}

export { DashboardFilters };