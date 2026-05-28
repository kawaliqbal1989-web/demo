import { SearchableDropdown } from "../../components/SearchableDropdown";

const BULK_STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "TRANSFERRED", "ARCHIVED"];

function CenterEnrollmentsBulkActions({
  selectedEnrollmentCount,
  selectedRowsWithTeacherCount,
  bulkTeacherDropdownOptions,
  bulkTeacherUserId,
  onBulkTeacherUserIdChange,
  bulkStatus,
  onBulkStatusChange,
  bulkUpdating,
  bulkActionMode,
  onRequestBulkApplyUpdates,
  onRequestBulkClearTeacher
}) {
  if (!selectedEnrollmentCount) {
    return null;
  }

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
        Bulk actions for {selectedEnrollmentCount} selected enrollment{selectedEnrollmentCount > 1 ? "s" : ""} on this page.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ minWidth: 260, flex: "1 1 320px" }}>
          Teacher update (optional)
          <SearchableDropdown
            options={bulkTeacherDropdownOptions}
            value={bulkTeacherUserId}
            onChange={onBulkTeacherUserIdChange}
            placeholder="Keep current teacher"
            disabled={bulkUpdating}
          />
        </label>

        <label style={{ minWidth: 180, flex: "0 1 200px" }}>
          Status update (optional)
          <select className="select" value={bulkStatus} onChange={(e) => onBulkStatusChange(e.target.value)} disabled={bulkUpdating}>
            <option value="">Keep current status</option>
            {BULK_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>

        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={onRequestBulkApplyUpdates}
          disabled={bulkUpdating || (!bulkTeacherUserId && !bulkStatus) || !selectedEnrollmentCount}
        >
          {bulkUpdating && bulkActionMode !== "clear"
            ? "Applying..."
            : `Apply updates (${selectedEnrollmentCount})`}
        </button>

        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={onRequestBulkClearTeacher}
          disabled={bulkUpdating || !selectedRowsWithTeacherCount}
        >
          {bulkUpdating && bulkActionMode === "clear"
            ? "Clearing..."
            : `Clear teacher (${selectedRowsWithTeacherCount})`}
        </button>
      </div>
    </div>
  );
}

export { CenterEnrollmentsBulkActions };