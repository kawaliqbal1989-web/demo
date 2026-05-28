import { useState } from "react";
import { SearchableDropdown } from "../../components/SearchableDropdown";
import { DataTable } from "../../components/DataTable";

function CenterEnrollmentsRosterTable({
  rows,
  selectedEnrollmentIds,
  onSelectionChange,
  bulkUnenrolling,
  selectedActiveEnrollmentCount,
  onRequestBulkUnenroll,
  onRequestUnenroll,
  teacherOptions = [],
  onAssignTeacher
}) {
  const [assigningRowId, setAssigningRowId] = useState(null);
  const [assigningTeacherId, setAssigningTeacherId] = useState("");
  const [assigningSaving, setAssigningSaving] = useState(false);

  const rowTeacherOptions = [
    { value: "", label: "\u2014 Clear assignment \u2014" },
    ...(teacherOptions || []).map((t) => ({
      value: t.id,
      label: t?.teacherProfile?.fullName || t.username
    }))
  ];

  const startAssign = (row) => {
    setAssigningRowId(row.id);
    setAssigningTeacherId(row?.assignedTeacher?.id || "");
  };

  const cancelAssign = () => {
    setAssigningRowId(null);
    setAssigningTeacherId("");
  };

  const saveAssign = async (rowId) => {
    setAssigningSaving(true);
    try {
      await onAssignTeacher(rowId, assigningTeacherId || null);
      setAssigningRowId(null);
      setAssigningTeacherId("");
    } finally {
      setAssigningSaving(false);
    }
  };

  const fmtDate = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <DataTable
      columns={[
        { key: "admissionNo", header: "Admission No", render: (row) => row?.student?.admissionNo || "" },
        { key: "name", header: "Student", render: (row) => `${row?.student?.firstName || ""} ${row?.student?.lastName || ""}`.trim() },
        { key: "level", header: "Level", render: (row) => row?.level?.name || "" },
        { key: "teacher", header: "Assigned Teacher", render: (row) => {
          if (assigningRowId === row.id) {
            return (
              <div style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 220 }}>
                <div style={{ flex: 1 }}>
                  <SearchableDropdown
                    options={rowTeacherOptions}
                    value={assigningTeacherId}
                    onChange={setAssigningTeacherId}
                    placeholder="Select teacher"
                  />
                </div>
                <button className="button" style={{ width: "auto" }} disabled={assigningSaving} onClick={() => saveAssign(row.id)}>
                  {assigningSaving ? "\u2026" : "Save"}
                </button>
                <button className="button secondary" style={{ width: "auto" }} onClick={cancelAssign} disabled={assigningSaving}>
                  Cancel
                </button>
              </div>
            );
          }
          const t = row?.assignedTeacher;
          if (!t) return <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>Unassigned</span>;
          return t?.teacherProfile?.fullName || t?.username || "";
        } },
        { key: "feeStatus", header: "Fee Status", render: (row) => row?.student?.feeStatus || "" },
        {
          key: "pendingInstallments",
          header: "Pending Dues",
          render: (row) => {
            const pendingCount = row?.student?.pendingInstallmentsCount || 0;
            const overdueCount = row?.student?.overdueInstallmentsCount || 0;
            const pendingAmount = row?.student?.pendingFeeAmount || 0;
            if (!pendingCount) {
              return "Clear";
            }

            const amountText = `Rs ${Number(pendingAmount).toLocaleString("en-IN")}`;
            if (overdueCount > 0) {
              return `${pendingCount} pending (${overdueCount} overdue) / ${amountText}`;
            }
            return `${pendingCount} pending / ${amountText}`;
          }
        },
        { key: "status", header: "Status", render: (row) => row?.status || "" },
        { key: "enrolledOn", header: "Enrolled On", render: (row) => fmtDate(row?.createdAt) },
        {
          key: "actions",
          header: "Actions",
          render: (row) => (
            <div style={{ display: "flex", gap: 6 }}>
              <a
                className="button secondary"
                style={{ width: "auto" }}
                href={`/center/students/${row?.student?.id}`}
              >
                View
              </a>
              <button
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => startAssign(row)}
                disabled={assigningRowId !== null}
              >
                {row?.assignedTeacher ? "Change teacher" : "Assign teacher"}
              </button>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => onRequestUnenroll(row)}>
                Unenroll
              </button>
            </div>
          )
        }
      ]}
      rows={rows}
      keyField="id"
      selectable
      selectedKeys={selectedEnrollmentIds}
      onSelectionChange={onSelectionChange}
      bulkActions={[
        {
          label: bulkUnenrolling
            ? "Unenrolling..."
            : `Unenroll selected (${selectedActiveEnrollmentCount})`,
          onClick: onRequestBulkUnenroll,
          disabled: bulkUnenrolling || selectedActiveEnrollmentCount === 0
        }
      ]}
    />
  );
}

export { CenterEnrollmentsRosterTable };