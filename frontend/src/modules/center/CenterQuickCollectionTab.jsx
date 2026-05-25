import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { listStudents, recordStudentPayment, getStudentFeesContext } from "../../services/studentsService";
import { listBatches } from "../../services/batchesService";
import { listLevels } from "../../services/levelsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const PAYMENT_MODES = ["CASH", "ONLINE", "GPAY", "PAYTM"];

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function CenterQuickCollectionTab() {
  // Filter state
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [search, setSearch] = useState("");

  // Student data
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Payment entries (rows with user input)
  const [paymentEntries, setPaymentEntries] = useState({});
  // Row states: saving, success, error
  const [rowStates, setRowStates] = useState({});

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

  // Fetch students with pending fees
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Call listStudents with filters
      const res = await listStudents({
        limit: 100,
        offset: 0,
        q: search,
        levelId: levelId || undefined,
        batchId: batchId || undefined,
        status: "ACTIVE"
      });

      let studentList = res?.data?.items || res?.items || [];

      // Fetch fee context for each student to get pending amounts
      // This is temporary until backend supports bulk fee data
      const studentsWithFees = await Promise.all(
        studentList.map(async (student) => {
          try {
            const feeContext = await getStudentFeesContext(student.id);
            const pendingAmount = feeContext?.data?.summary?.pendingAmount || 0;
            const paidAmount = feeContext?.data?.summary?.paidAmount || 0;
            const totalFeeAmount = student.totalFeeAmount || 0;

            return {
              ...student,
              paidAmount,
              pendingAmount,
              overdueAmount: 0 // Will be calculated by backend later
            };
          } catch {
            return {
              ...student,
              paidAmount: 0,
              pendingAmount: student.totalFeeAmount || 0,
              overdueAmount: 0
            };
          }
        })
      );

      // Filter to only show students with pending > 0
      const studentsWithPending = studentsWithFees.filter((s) => s.pendingAmount > 0);

      setStudents(studentsWithPending);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [search, levelId, batchId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Handle payment input change
  const handlePaymentChange = (studentId, field, value) => {
    setPaymentEntries((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }));
  };

  // Save payment for a student
  const handleSavePayment = async (student) => {
    const entry = paymentEntries[student.id];
    if (!entry) return;

    const amount = Number(entry.amount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (amount > student.pendingAmount) {
      toast.error("Amount exceeds pending balance");
      return;
    }

    const paymentMode = entry.paymentMode || "CASH";

    // Set row state to saving
    setRowStates((prev) => ({
      ...prev,
      [student.id]: { status: "saving" }
    }));

    try {
      await recordStudentPayment(student.id, {
        type: "ENROLLMENT",
        amount,
        paymentMode,
        receivedAt: entry.receivedAt || todayISO(),
        feeScheduleType: "MONTHLY",
        reference: entry.reference || "",
        notes: entry.notes || ""
      });

      // Set row state to success
      setRowStates((prev) => ({
        ...prev,
        [student.id]: { status: "success", message: "Payment saved!" }
      }));

      // Clear entry
      setPaymentEntries((prev) => {
        const updated = { ...prev };
        delete updated[student.id];
        return updated;
      });

      toast.success(`Payment recorded for ${student.firstName} ${student.lastName}`);

      // Refresh student data after a short delay
      setTimeout(() => {
        fetchStudents();
      }, 1000);
    } catch (err) {
      const errorMsg = getFriendlyErrorMessage(err) || "Failed to save payment";
      setRowStates((prev) => ({
        ...prev,
        [student.id]: { status: "error", message: errorMsg }
      }));
      toast.error(errorMsg);
    }
  };

  // Clear entry for a student
  const handleClearEntry = (studentId) => {
    setPaymentEntries((prev) => {
      const updated = { ...prev };
      delete updated[studentId];
      return updated;
    });
    setRowStates((prev) => {
      const updated = { ...prev };
      delete updated[studentId];
      return updated;
    });
  };

  // Count entries
  const entryCount = Object.keys(paymentEntries).filter((id) => paymentEntries[id]?.amount).length;

  const getRowEntry = (studentId) => paymentEntries[studentId] || {};
  const getRowState = (studentId) => rowStates[studentId] || {};

  return (
    <div className="card">
      {/* Filters Section */}
      <div className="card-header">
        <h3>Quick Fee Collection</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Enter payments for multiple students quickly. Use filters to find students by batch or level.
        </p>
      </div>

      <div className="card-body">
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

        {/* Entry Counter */}
        {entryCount > 0 && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "var(--color-primary-50)",
              border: "1px solid var(--color-primary-200)",
              borderRadius: 6,
              marginBottom: "1rem",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-primary-700)"
            }}
          >
            💰 {entryCount} payment{entryCount > 1 ? "s" : ""} entered
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
            Loading students...
          </div>
        )}

        {/* Students Table */}
        {!loading && students.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
            No students with pending fees found. Try adjusting filters.
          </div>
        )}

        {!loading && students.length > 0 && (
          <div className="dash-table-wrap" style={{ overflowX: "auto" }}>
            <table className="dash-table" style={{ minWidth: "1200px" }}>
              <thead>
                <tr>
                  <th style={{ width: "100px" }}>Student Code</th>
                  <th style={{ width: "150px" }}>Student Name</th>
                  <th style={{ width: "120px" }}>Batch</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Total Fee</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Paid</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Pending</th>
                  <th style={{ width: "120px" }}>Amount Received</th>
                  <th style={{ width: "120px" }}>Payment Mode</th>
                  <th style={{ width: "150px" }}>Reference</th>
                  <th style={{ width: "150px" }}>Note</th>
                  <th style={{ width: "120px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const entry = getRowEntry(student.id);
                  const state = getRowState(student.id);
                  const isSuccess = state.status === "success";
                  const isError = state.status === "error";
                  const isSaving = state.status === "saving";

                  return (
                    <tr
                      key={student.id}
                      style={{
                        backgroundColor: isSuccess ? "#f0fdf4" : isError ? "#fef2f2" : undefined
                      }}
                    >
                      <td>{student.studentCode || "—"}</td>
                      <td>{student.firstName} {student.lastName}</td>
                      <td>{student.batchName || "—"}</td>
                      <td style={{ textAlign: "right" }}>₹{formatMoney(student.totalFeeAmount)}</td>
                      <td style={{ textAlign: "right" }}>₹{formatMoney(student.paidAmount)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>₹{formatMoney(student.pendingAmount)}</td>
                      <td>
                        {!isSuccess ? (
                          <input
                            type="number"
                            className="form-input"
                            placeholder="0.00"
                            value={entry.amount || ""}
                            onChange={(e) => handlePaymentChange(student.id, "amount", e.target.value)}
                            disabled={isSaving}
                            style={{ width: "100%" }}
                          />
                        ) : (
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>₹{formatMoney(entry.amount || 0)}</span>
                        )}
                      </td>
                      <td>
                        {!isSuccess ? (
                          <select
                            className="form-input"
                            value={entry.paymentMode || "CASH"}
                            onChange={(e) => handlePaymentChange(student.id, "paymentMode", e.target.value)}
                            disabled={isSaving}
                            style={{ width: "100%" }}
                          >
                            {PAYMENT_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {mode}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{entry.paymentMode || "CASH"}</span>
                        )}
                      </td>
                      <td>
                        {!isSuccess ? (
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Ref #"
                            value={entry.reference || ""}
                            onChange={(e) => handlePaymentChange(student.id, "reference", e.target.value)}
                            disabled={isSaving}
                            style={{ width: "100%" }}
                          />
                        ) : (
                          <span>{entry.reference || "—"}</span>
                        )}
                      </td>
                      <td>
                        {!isSuccess ? (
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Note"
                            value={entry.notes || ""}
                            onChange={(e) => handlePaymentChange(student.id, "notes", e.target.value)}
                            disabled={isSaving}
                            style={{ width: "100%" }}
                          />
                        ) : (
                          <span>{entry.notes || "—"}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          {!isSuccess && !isSaving && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleSavePayment(student)}
                                disabled={!entry.amount}
                                title="Save Payment"
                              >
                                💾
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleClearEntry(student.id)}
                                title="Clear Entry"
                              >
                                ✖
                              </button>
                            </>
                          )}
                          {isSaving && <span style={{ fontSize: 12, color: "#6b7280" }}>Saving...</span>}
                          {isSuccess && <span style={{ fontSize: 18 }}>✅</span>}
                          {isError && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleClearEntry(student.id)}
                              title={state.message}
                            >
                              ⚠️
                            </button>
                          )}
                          <a
                            href={`/center/students/${student.id}/fees`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            title="Open Full Fee Page"
                          >
                            🔗
                          </a>
                        </div>
                        {isError && (
                          <div style={{ fontSize: 11, color: "#dc2626", marginTop: "0.25rem" }}>
                            {state.message}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
