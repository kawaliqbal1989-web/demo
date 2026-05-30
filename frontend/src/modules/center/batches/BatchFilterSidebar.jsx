import { BATCH_MODALITY_OPTIONS, BATCH_STATUS_OPTIONS } from "./batchCatalog.constants";

function BatchFilterSidebar({
  open = false,
  teachers = [],
  levels = [],
  query,
  activeFilterCount = 0,
  onClose,
  onQueryChange,
  onToggleStatus,
  onClearFilters
}) {
  return (
    <aside className={`batch-filter-sidebar${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="batch-filter-sidebar__card card">
        <div className="batch-filter-sidebar__header">
          <div className="batch-filter-sidebar__header-copy">
            <h3>Filters</h3>
            <span>{activeFilterCount ? `${activeFilterCount} active filters` : "Narrow table results"}</span>
          </div>
          <div className="batch-filter-sidebar__header-actions">
            <button className="button secondary" type="button" onClick={onClearFilters}>
              Clear
            </button>
            <button className="button secondary batch-filter-sidebar__close" type="button" onClick={onClose}>
              Hide
            </button>
          </div>
        </div>

        <div className="batch-filter-sidebar__grid">
          <label className="batch-field">
            <span>Teacher</span>
            <select className="select" value={query.teacherId} onChange={(event) => onQueryChange({ teacherId: event.target.value || null }, { resetPage: true })}>
              <option value="">All teachers</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.label}</option>
              ))}
            </select>
          </label>

          <label className="batch-field">
            <span>Level</span>
            <select className="select" value={query.levelId} onChange={(event) => onQueryChange({ levelId: event.target.value || null }, { resetPage: true })}>
              <option value="">All levels</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>{level.label}</option>
              ))}
            </select>
          </label>

          <label className="batch-field">
            <span>Modality</span>
            <select className="select" value={query.modality} onChange={(event) => onQueryChange({ modality: event.target.value || null }, { resetPage: true })}>
              <option value="">All modes</option>
              {BATCH_MODALITY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <div className="batch-field">
            <span>Status</span>
            <div className="batch-chip-grid">
              {BATCH_STATUS_OPTIONS.map((status) => {
                const active = query.statuses.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    className={`batch-chip-button${active ? " is-active" : ""}`}
                    onClick={() => onToggleStatus(status)}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="batch-field">
            <span>Schedule type</span>
            <div className="batch-segmented">
              {[
                { label: "Any", value: "" },
                { label: "Weekday", value: "WEEKDAY" },
                { label: "Weekend", value: "WEEKEND" }
              ].map((option) => (
                <button
                  key={option.value || "all"}
                  type="button"
                  className={`batch-segmented__button${query.dayType === option.value ? " is-active" : ""}`}
                  onClick={() => onQueryChange({ dayType: option.value || null }, { resetPage: true })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="batch-field">
            <span>Flags</span>
            <label className="batch-checkbox">
              <input type="checkbox" checked={query.includeArchived} onChange={(event) => onQueryChange({ archived: event.target.checked ? "1" : null }, { resetPage: true })} />
              <span>Include archived batches</span>
            </label>
            <label className="batch-checkbox">
              <input type="checkbox" checked={query.fullOnly} onChange={(event) => onQueryChange({ fullOnly: event.target.checked ? "1" : null }, { resetPage: true })} />
              <span>Only full batches</span>
            </label>
          </div>
        </div>

        <button className="button secondary batch-filter-sidebar__close-mobile" type="button" onClick={onClose}>
          Apply filters
        </button>
      </div>
    </aside>
  );
}

export { BatchFilterSidebar };