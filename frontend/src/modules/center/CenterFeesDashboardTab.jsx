import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { getFeesStudentWise } from "../../services/reportsService";
import { listBatches } from "../../services/batchesService";
import { listLevels } from "../../services/levelsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function getStatusBadge(overdue, pending, paid) {
  const overdueAmount = Number(overdue || 0);
  const pendingAmount = Number(pending || 0);
  const paidAmount = Number(paid || 0);

  if (pendingAmount <= 0 && paidAmount > 0) {
    return <span className="badge badge-success">PAID</span>;
  }

  if (overdueAmount > 0 && pendingAmount > 0) {
    return <span className="badge badge-danger">OVERDUE</span>;
  }

  if (pendingAmount > 0) {
    return <span className="badge badge-warning">PENDING</span>;
  }

  if (paidAmount > 0) {
    return <span className="badge badge-success">PAID</span>;
  }

  return <span className="badge badge-secondary">NO DATA</span>;
}

export function CenterFeesDashboardTab() {
  // Filter state
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [search, setSearch] = useState("");

  // Data state
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({ totalPaid: 0, totalOverdue: 0, totalPending: 0, studentCount: 0 });

  // Load filter dropdowns
  useEffect(() => {
    const load = async () => {
      try {
        const [batchesRes, levelsRes] = await Promise.all([
          listBatches({ limit: 200, offset: 0 }),
          listLevels()
        ]);
        setBatches(batchesRes?.data?.items || batchesRes?.items || []);
        setLevels(Array.isArray(levelsRes?.data) ? levelsRes.data : levelsRes || []);
      } catch (err) {
        console.error("Failed to load filter data:", err);
      }
    };
    load();
  }, []);

  // Fetch student-wise fee data
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        limit: 500,
        offset: 0
      };

      if (levelId) params.levelId = levelId;
      if (batchId) params.batchId = batchId;
      if (search) params.q = search;

      const res = await getFeesStudentWise(params);
      let items = res?.data?.items || res?.items || [];

      // Calculate summary
      const totalPaid = items.reduce((sum, s) => sum + Number(s.paidInRange || 0), 0);
      const totalOverdue = items.reduce((sum, s) => sum + Number(s.overduePending || 0), 0);
      const totalPending = items.reduce((sum, s) => sum + Number(s.duePending || 0), 0);

      setSummary({
        totalPaid,
        totalOverdue,
        totalPending,
        studentCount: items.length
      });

      setStudents(items);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load student fees.");
      setStudents([]);
      setSummary({ totalPaid: 0, totalOverdue: 0, totalPending: 0, studentCount: 0 });
    } finally {
      setLoading(false);
    }
  }, [levelId, batchId, search]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  return (
    <div className="card">
      <div className="card-header">
        <h3>Fee Dashboard</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Student-wise fee overview. Click any student to manage their fees.
        </p>
      </div>

      <div className="card-body">
        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <div className="card" style={{ padding: "1rem", background: "var(--color-bg-success-light)" }}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: "0.25rem" }}>Total Collected</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-success)" }}>
              ₹{formatMoney(summary.totalPaid)}
            </div>
          </div>
          <div className="card" style={{ padding: "1rem", background: "var(--color-bg-error-light)" }}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: "0.25rem" }}>Total Overdue</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#dc2626" }}>
              ₹{formatMoney(summary.totalOverdue)}
            </div>
          </div>
          <div className="card" style={{ padding: "1rem", background: "var(--color-bg-warning)" }}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: "0.25rem" }}>Total Pending</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-warning)" }}>
              ₹{formatMoney(summary.totalPending)}
            </div>
          </div>
          <div className="card" style={{ padding: "1rem", background: "var(--color-bg-light)" }}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: "0.25rem" }}>Students</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {summary.studentCount}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "1.5rem" }}>
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

        {/* Loading/Error States */}
        {loading && (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            Loading student fees...
          </div>
        )}

        {error && (
          <div className="card" style={{ padding: "1rem", background: "var(--color-bg-error-light)", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Student List Table */}
        {!loading && !error && students.length === 0 && (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            No students found with fee activity in the selected period.
          </div>
        )}

        {!loading && !error && students.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: "120px" }}>Student Code</th>
                  <th>Student Name</th>
                  <th style={{ width: "120px", textAlign: "right" }}>Total Fee</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Paid</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Overdue</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Pending</th>
                  <th style={{ width: "80px" }}>Overdue Count</th>
                  <th style={{ width: "100px" }}>Status</th>
                  <th style={{ width: "150px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => (
                  <tr key={student.id || `student-${index}`}>
                    <td>{student.admissionNo || "—"}</td>
                    <td>
                      <strong>{student.firstName || ""} {student.lastName || ""}</strong>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {student.totalFeeAmount == null ? "—" : `₹${formatMoney(student.totalFeeAmount)}`}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--color-text-success)", fontWeight: 600 }}>
                      ₹{formatMoney(student.paidInRange || 0)}
                    </td>
                    <td style={{ textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                      ₹{formatMoney(student.overduePending || 0)}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--color-text-warning)", fontWeight: 600 }}>
                      ₹{formatMoney(student.duePending || 0)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {student.overdueCount > 0 ? (
                        <span className="badge badge-danger">{student.overdueCount}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {getStatusBadge(
                        student.overduePending || 0,
                        student.duePending || 0,
                        student.paidInRange || 0
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/center/students/${student.id}/fees`}
                        className="button secondary"
                        style={{ width: "100%", fontSize: 13, padding: "0.375rem 0.75rem" }}
                      >
                        Manage Fees →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Info Footer */}
        {!loading && !error && students.length > 0 && (
          <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--color-bg-light)", borderRadius: 6, fontSize: 13, color: "var(--color-text-muted)" }}>
            <strong>Note:</strong> Click "Manage Fees" to view detailed fee history, record payments, create installments, and manage fee concessions for each student.
          </div>
        )}
      </div>
    </div>
  );
}
