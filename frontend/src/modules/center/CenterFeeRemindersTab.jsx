import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { getFeesReminders } from "../../services/reportsService";
import { listBatches } from "../../services/batchesService";
import { listLevels } from "../../services/levelsService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useAuth } from "../../hooks/useAuth";

const STATUS_OPTIONS = [
  { value: "PENDING,OVERDUE", label: "Pending & Overdue" },
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending Only" },
  { value: "OVERDUE", label: "Overdue Only" },
  { value: "", label: "All Statuses" }
];

const DAYS_OVERDUE_OPTIONS = [
  { value: "", label: "All" },
  { value: "1-7", label: "1-7 days overdue" },
  { value: "8-30", label: "8-30 days overdue" },
  { value: "31+", label: "More than 30 days overdue" }
];

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function pickTeacherLabel(teacher) {
  if (!teacher || typeof teacher !== "object") return "";
  return teacher.teacherProfile?.fullName || teacher.fullName || teacher.username || teacher.email || "";
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function calculateDaysOverdue(dueDate) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = now - due;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function getStatusBadge(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PAID") {
    return <span className="badge badge-success">PAID</span>;
  }
  if (normalized === "PENDING") {
    return <span className="badge badge-warning">PENDING</span>;
  }
  if (normalized === "OVERDUE") {
    return <span className="badge badge-danger">OVERDUE</span>;
  }
  return <span className="badge badge-secondary">NO DATA</span>;
}

export function CenterFeeRemindersTab() {
  const { isAuthenticated, authBootstrapPending, mustChangePassword } = useAuth();

  // Filter state
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING,OVERDUE");
  const [daysOverdueFilter, setDaysOverdueFilter] = useState("");
  const [search, setSearch] = useState("");

  // Data state
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load filter dropdowns
  useEffect(() => {
    if (authBootstrapPending || !isAuthenticated || mustChangePassword) {
      return;
    }

    const load = async () => {
      try {
        const [batchesRes, levelsRes, teachersRes] = await Promise.all([
          listBatches({ limit: 200, offset: 0 }),
          listLevels(),
          listTeachers({ limit: 200, offset: 0 })
        ]);
        setBatches(batchesRes?.data?.items || batchesRes?.items || []);
        setLevels(Array.isArray(levelsRes?.data) ? levelsRes.data : levelsRes || []);
        setTeachers(teachersRes?.data?.items || teachersRes?.items || []);
      } catch (err) {
        console.error("Failed to load filter data:", err);
      }
    };
    load();
  }, [authBootstrapPending, isAuthenticated, mustChangePassword]);

  // Fetch pending installments
  const fetchInstallments = useCallback(async () => {
    if (authBootstrapPending || !isAuthenticated || mustChangePassword) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = {
        limit: 500, // Get more for calling list
        offset: 0
      };

      if (statusFilter) params.status = statusFilter;
      if (batchId) params.batchId = batchId;
      if (levelId) params.levelId = levelId;
      if (teacherId) params.teacherId = teacherId;
      if (search) params.q = search;

      const res = await getFeesReminders(params);
      let items = res?.data?.items || res?.items || [];

      // Filter by days overdue if selected
      if (daysOverdueFilter) {
        items = items.filter((item) => {
          const days = calculateDaysOverdue(item.nextDueDate || item.dueDate);
          if (daysOverdueFilter === "1-7") return days >= 1 && days <= 7;
          if (daysOverdueFilter === "8-30") return days >= 8 && days <= 30;
          if (daysOverdueFilter === "31+") return days > 30;
          return true;
        });
      }

      setInstallments(items);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load fee installments.");
      setInstallments([]);
    } finally {
      setLoading(false);
    }
  }, [authBootstrapPending, isAuthenticated, mustChangePassword, statusFilter, batchId, levelId, teacherId, search, daysOverdueFilter]);

  useEffect(() => {
    fetchInstallments();
  }, [fetchInstallments]);

  // Export to CSV
  const handleExportCSV = () => {
    if (installments.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Student Code",
      "Student Name",
      "Phone",
      "Parent Phone",
      "Pending Amount",
      "Last Payment Date",
      "Teacher Name",
      "Batch Name",
      "Due Date",
      "Days Overdue"
    ];

    const rows = installments.map((item) => [
      item.student?.studentCode || "—",
      `${item.student?.firstName || ""} ${item.student?.lastName || ""}`.trim(),
      item.student?.contactNumber || "—",
      item.student?.parentContactNumber || "—",
      formatMoney(item.pendingAmount || item.amount),
      formatDate(item.lastPaymentDate),
      item.student?.teacher?.name || "—",
      item.student?.batch?.name || "—",
      formatDate(item.nextDueDate || item.dueDate),
      calculateDaysOverdue(item.nextDueDate || item.dueDate)
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fee-reminders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success("CSV exported successfully!");
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="card">
      {/* Filters Section */}
      <div className="card-header no-print">
        <h3>Fee Reminders & Calling List</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          View students by fee status for reminder calls. Print or export for follow-ups.
        </p>
      </div>

      <div className="card-body">
        {/* Filters */}
        <div className="no-print" style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "1.5rem" }}>
          <div>
            <label htmlFor="status-filter" style={{ display: "block", marginBottom: "0.25rem", fontSize: 13, fontWeight: 600 }}>
              Status
            </label>
            <select
              id="status-filter"
              className="form-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="batch-filter" style={{ display: "block", marginBottom: "0.25rem", fontSize: 13, fontWeight: 600 }}>
              Batch
            </label>
            <select
              id="batch-filter"
              className="form-input"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">All Batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="level-filter" style={{ display: "block", marginBottom: "0.25rem", fontSize: 13, fontWeight: 600 }}>
              Level
            </label>
            <select
              id="level-filter"
              className="form-input"
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">All Levels</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="teacher-filter" style={{ display: "block", marginBottom: "0.25rem", fontSize: 13, fontWeight: 600 }}>
              Teacher
            </label>
            <select
              id="teacher-filter"
              className="form-input"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">All Teachers</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {pickTeacherLabel(teacher)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="days-overdue-filter" style={{ display: "block", marginBottom: "0.25rem", fontSize: 13, fontWeight: 600 }}>
              Days Overdue
            </label>
            <select
              id="days-overdue-filter"
              className="form-input"
              value={daysOverdueFilter}
              onChange={(e) => setDaysOverdueFilter(e.target.value)}
            >
              {DAYS_OVERDUE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="search-filter" style={{ display: "block", marginBottom: "0.25rem", fontSize: 13, fontWeight: 600 }}>
              Search Student
            </label>
            <input
              id="search-filter"
              type="text"
              className="form-input"
              placeholder="Name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="no-print" style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <button className="btn btn-primary" onClick={handlePrint}>
            🖨️ Print
          </button>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            📥 Export CSV
          </button>
          <button className="btn btn-secondary" onClick={fetchInstallments}>
            🔄 Refresh
          </button>
        </div>

        {/* Print Header (only visible when printing) */}
        <div className="print-only" style={{ marginBottom: "1.5rem", textAlign: "center" }}>
          <h2>Fee Reminder Calling List</h2>
          <p>{new Date().toLocaleDateString()}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error no-print" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
            Loading fee reminders...
          </div>
        )}

        {/* Empty State */}
        {!loading && installments.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
            No students found for the selected fee filters.
          </div>
        )}

        {/* Reminders Table */}
        {!loading && installments.length > 0 && (
          <>
            <div className="no-print" style={{ marginBottom: "1rem", fontSize: 14, fontWeight: 600 }}>
              Total: {installments.length} student{installments.length > 1 ? "s" : ""} matching the selected status
            </div>

            <div className="dash-table-wrap" style={{ overflowX: "auto" }}>
              <table className="dash-table" style={{ minWidth: "1000px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "100px" }}>Student Code</th>
                    <th style={{ width: "150px" }}>Student Name</th>
                    <th style={{ width: "120px" }}>Phone</th>
                    <th style={{ width: "120px" }}>Parent Phone</th>
                    <th style={{ width: "100px", textAlign: "right" }}>Pending</th>
                    <th style={{ width: "110px" }}>Last Payment</th>
                    <th style={{ width: "120px" }}>Teacher</th>
                    <th style={{ width: "120px" }}>Batch</th>
                    <th style={{ width: "100px" }}>Next Due</th>
                    <th style={{ width: "80px", textAlign: "center" }}>Days Overdue</th>
                    <th className="no-print" style={{ width: "80px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((item) => {
                    const daysOverdue = calculateDaysOverdue(item.nextDueDate || item.dueDate);
                    return (
                      <tr key={item.id}>
                        <td>{item.student?.studentCode || "—"}</td>
                        <td>
                          <a
                            href={`/center/students/${item.student?.id}/fees`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="no-print"
                            style={{ color: "var(--color-primary)", textDecoration: "underline", fontWeight: 600 }}
                          >
                            {item.student?.firstName} {item.student?.lastName}
                          </a>
                          <span className="print-only">
                            {item.student?.firstName} {item.student?.lastName}
                          </span>
                        </td>
                        <td>{item.student?.contactNumber || "—"}</td>
                        <td>{item.student?.parentContactNumber || "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          ₹{formatMoney(item.pendingAmount || item.amount)}
                        </td>
                        <td>{formatDate(item.lastPaymentDate)}</td>
                        <td>{item.student?.teacher?.name || "—"}</td>
                        <td>{item.student?.batch?.name || "—"}</td>
                        <td>{formatDate(item.nextDueDate || item.dueDate)}</td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>
                          {daysOverdue > 0 ? daysOverdue : "—"}
                        </td>
                        <td className="no-print">{getStatusBadge(item.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Info Note */}
            <div className="no-print" style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--color-bg-light)", borderRadius: 6, fontSize: 13, color: "var(--color-text-muted)" }}>
              <strong>💡 Tip:</strong> Click any student name to open their detailed fee management page where you can record payments, create installments, and view complete fee history.
            </div>
          </>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
