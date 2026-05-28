import { useMemo } from "react";
import { SearchableDropdown } from "../../components/SearchableDropdown";

function CenterEnrollmentsFilters({
  rosterQuery,
  onRosterQueryChange,
  rosterTeacherUserId,
  onRosterTeacherUserIdChange,
  teacherOptions,
  rosterLevelId,
  onRosterLevelIdChange,
  levels,
  rosterStatus,
  onRosterStatusChange,
  rosterStudentActive,
  onRosterStudentActiveChange,
  rosterFrom,
  onRosterFromChange,
  rosterTo,
  onRosterToChange,
  rosterFeeStatus,
  onRosterFeeStatusChange,
  rosterPendingInstallments,
  onRosterPendingInstallmentsChange,
  onApplyRosterFilters,
  onClearRosterFilters,
  onQuickFilter
}) {
  const teacherDropdownOptions = useMemo(() => [
    { value: "NONE", label: "Unassigned" },
    ...teacherOptions.map((t) => ({
      value: t.id,
      label: t?.teacherProfile?.fullName || t.username
    }))
  ], [teacherOptions]);

  const activeFilterCount = [
    rosterTeacherUserId,
    rosterLevelId,
    rosterStatus !== "ACTIVE" ? rosterStatus : "",
    rosterStudentActive,
    rosterFrom,
    rosterTo,
    rosterFeeStatus,
    rosterPendingInstallments,
  ].filter(Boolean).length;

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      {activeFilterCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>Filters</span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: "var(--color-primary, #2563eb)", color: "#fff",
            borderRadius: 999, padding: "1px 8px", lineHeight: "18px"
          }}>
            {activeFilterCount} active
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ minWidth: 220, flex: "1 1 260px" }}>
          Search enrolled student
          <input
            className="input"
            placeholder="Admission no or name"
            value={rosterQuery}
            onChange={(e) => onRosterQueryChange(e.target.value)}
          />
        </label>

        <label style={{ minWidth: 180, flex: "0 1 200px" }}>
          Teacher
          <SearchableDropdown
            options={teacherDropdownOptions}
            value={rosterTeacherUserId}
            onChange={onRosterTeacherUserIdChange}
            placeholder="All teachers"
          />
        </label>

        <label style={{ minWidth: 160, flex: "0 1 180px" }}>
          Level
          <select className="select" value={rosterLevelId} onChange={(e) => onRosterLevelIdChange(e.target.value)}>
            <option value="">All levels</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ minWidth: 150, flex: "0 1 170px" }}>
          Status
          <select className="select" value={rosterStatus} onChange={(e) => onRosterStatusChange(e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="TRANSFERRED">TRANSFERRED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>

        <label style={{ minWidth: 160, flex: "0 1 180px" }}>
          Student active
          <select className="select" value={rosterStudentActive} onChange={(e) => onRosterStudentActiveChange(e.target.value)}>
            <option value="">All students</option>
            <option value="ACTIVE">Active students</option>
            <option value="INACTIVE">Inactive students</option>
          </select>
        </label>

        <label style={{ minWidth: 150, flex: "0 1 170px" }}>
          Created from
          <input className="input" type="date" value={rosterFrom} onChange={(e) => onRosterFromChange(e.target.value)} />
        </label>

        <label style={{ minWidth: 150, flex: "0 1 170px" }}>
          Created to
          <input className="input" type="date" value={rosterTo} onChange={(e) => onRosterToChange(e.target.value)} />
        </label>

        <label style={{ minWidth: 160, flex: "0 1 180px" }}>
          Fee status
          <select className="select" value={rosterFeeStatus} onChange={(e) => onRosterFeeStatusChange(e.target.value)}>
            <option value="">All fee states</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="OVERDUE">Overdue</option>
            <option value="NOT_SET">Not set</option>
          </select>
        </label>

        <label style={{ minWidth: 190, flex: "0 1 210px" }}>
          Pending installments
          <select className="select" value={rosterPendingInstallments} onChange={(e) => onRosterPendingInstallmentsChange(e.target.value)}>
            <option value="">All installment states</option>
            <option value="HAS_PENDING">Has pending installments</option>
            <option value="HAS_OVERDUE">Has overdue installments</option>
            <option value="CLEAR">No pending installments</option>
          </select>
        </label>

        <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onApplyRosterFilters}>
          Apply Filters
        </button>

        <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onClearRosterFilters}>
          Clear
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600 }}>Quick:</span>
        {[
          { label: "No teacher assigned", patch: { teacherUserId: "NONE" } },
          { label: "Overdue fees", patch: { feeStatus: "OVERDUE" } },
          { label: "Has pending dues", patch: { pendingInstallments: "HAS_PENDING" } },
          { label: "Inactive students", patch: { studentActive: "INACTIVE" } },
        ].map(({ label, patch }) => (
          <button
            key={label}
            type="button"
            onClick={() => onQuickFilter(patch)}
            style={{
              fontSize: 11,
              padding: "2px 10px",
              borderRadius: 999,
              border: "1px solid var(--color-border, #d1d5db)",
              background: "var(--color-bg-subtle, #f9fafb)",
              cursor: "pointer",
              width: "auto"
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        Search applies automatically after a short delay. Use quick filters for one-click preset views.
      </div>
    </div>
  );
}

export { CenterEnrollmentsFilters };