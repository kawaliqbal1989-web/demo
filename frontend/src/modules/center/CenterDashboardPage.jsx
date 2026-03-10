import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listBatches } from "../../services/batchesService";
import { listMockTests, createMockTest, getMockTest, saveMockTestResults, updateMockTestStatus } from "../../services/mockTestsService";
import { getCenterDashboard, getCenterMe } from "../../services/centerService";
import { listAttendanceSessions } from "../../services/attendanceService";
import { getDashboardSummary } from "../../services/reportsService";
import { listWorksheets } from "../../services/worksheetsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMockTestStatusStyle(status) {
  if (status === "PUBLISHED") {
    return {
      background: "var(--color-bg-success-light)",
      color: "var(--color-text-success)"
    };
  }

  if (status === "ARCHIVED") {
    return {
      background: "var(--color-bg-muted)",
      color: "var(--color-text-label)"
    };
  }

  return {
    background: "var(--color-bg-warning)",
    color: "var(--color-text-warning)"
  };
}

function MetricCard({ label, value }) {
  return (
    <div className="card" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

import { useAuth } from "../../hooks/useAuth";

function CenterDashboardPage() {
  const { branding } = useAuth();
  const [searchParams] = useSearchParams();
  const mockTestsSectionRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [me, setMe] = useState(null);
  const [summary, setSummary] = useState(null);
  const [revenueStats, setRevenueStats] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);

  const [batches, setBatches] = useState([]);
  const [worksheets, setWorksheets] = useState([]);

  // Mock tests
  const [batchId, setBatchId] = useState("");
  const [title, setTitle] = useState("Weekly Mock Test");
  const [date, setDate] = useState(todayISO());
  const [maxMarks, setMaxMarks] = useState(100);
  const [worksheetId, setWorksheetId] = useState("");
  const [creating, setCreating] = useState(false);

  const [mockTests, setMockTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [selectedTest, setSelectedTest] = useState(null);
  const [savingResults, setSavingResults] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [marksByStudentId, setMarksByStudentId] = useState({});

  const rosterRows = useMemo(() => selectedTest?.roster || [], [selectedTest]);
  const isSelectedTestArchived = selectedTest?.status === "ARCHIVED";

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [meRes, dashRes, batchRes, worksheetRes, sessionsRes, revenueRes] = await Promise.allSettled([
        getCenterMe(),
        getCenterDashboard(),
        listBatches({ limit: 200, offset: 0 }),
        listWorksheets({ limit: 200, offset: 0, published: true }),
        listAttendanceSessions({ limit: 5, offset: 0 }),
        getDashboardSummary()
      ]);
      if (meRes.status === "fulfilled") setMe(meRes.value.data);
      if (dashRes.status === "fulfilled") setSummary(dashRes.value.data);
      if (batchRes.status === "fulfilled") setBatches(batchRes.value.data?.items || []);
      if (worksheetRes.status === "fulfilled") setWorksheets(worksheetRes.value.items || []);
      if (sessionsRes.status === "fulfilled") setRecentSessions(sessionsRes.value.data?.items || sessionsRes.value.data || []);
      if (revenueRes.status === "fulfilled") setRevenueStats(revenueRes.value.data || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const loadMockTests = async (nextBatchId = batchId) => {
    if (!nextBatchId) {
      setMockTests([]);
      return;
    }
    try {
      const data = await listMockTests({ limit: 50, offset: 0, batchId: nextBatchId });
      setMockTests(data.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load mock tests.");
    }
  };

  const loadSelectedTest = async (testId) => {
    if (!testId) {
      setSelectedTest(null);
      setMarksByStudentId({});
      return;
    }

    try {
      const data = await getMockTest(testId);
      setSelectedTest(data.data);

      const nextMarks = {};
      for (const row of data.data?.roster || []) {
        nextMarks[row.studentId] = row.marks ?? "";
      }
      setMarksByStudentId(nextMarks);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load mock test.");
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (searchParams.get("section") !== "mock-tests") {
      return;
    }
    const el = mockTestsSectionRef.current;
    if (!el) {
      return;
    }
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [searchParams]);

  const onCreateMockTest = async (e) => {
    e.preventDefault();
    if (!batchId) {
      setError("Batch is required");
      return;
    }

    setCreating(true);
    setError("");
    try {
      await createMockTest({
        batchId,
        worksheetId: worksheetId || undefined,
        title,
        date,
        maxMarks
      });
      setWorksheetId("");
      await loadMockTests(batchId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create mock test.");
    } finally {
      setCreating(false);
    }
  };

  const onSaveResults = async () => {
    if (!selectedTestId) {
      setError("Select a mock test.");
      return;
    }

    setSavingResults(true);
    setError("");

    try {
      const results = Object.entries(marksByStudentId).map(([studentId, marks]) => ({
        studentId,
        marks: marks === "" ? null : Number(marks)
      }));

      await saveMockTestResults(selectedTestId, results);
      await loadSelectedTest(selectedTestId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to save results.");
    } finally {
      setSavingResults(false);
    }
  };

  const onUpdateSelectedTestStatus = async (status) => {
    if (!selectedTest?.id) {
      setError("Select a mock test.");
      return;
    }

    setUpdatingStatus(true);
    setError("");
    try {
      await updateMockTestStatus(selectedTest.id, status);
      await Promise.all([loadMockTests(batchId), loadSelectedTest(selectedTest.id)]);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update mock test status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading center dashboard..." />;
  }

  const centerProfile = me?.centerProfile;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="dash-header">
        <div>
          <h2 className="dashboard-title">Center Dashboard</h2>
          <div className="subtext">Quick snapshot of your center operations.</div>
          {branding?.displayName || branding?.name ? (
            <div className="dash-brand-name">{branding?.displayName || branding?.name}</div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <MetricCard label="Active Students" value={summary?.activeStudents ?? 0} />
        <MetricCard label="Active Teachers" value={summary?.activeTeachers ?? 0} />
        <MetricCard label="New Admissions (7 days)" value={summary?.newAdmissions7d ?? 0} />
        <MetricCard label="Active Enrollments" value={summary?.activeEnrollments ?? 0} />
        {revenueStats?.totalRevenue != null && (
          <MetricCard label="Total Revenue" value={`₹${Number(revenueStats.totalRevenue).toLocaleString()}`} />
        )}
        {revenueStats?.pendingDues != null && (
          <MetricCard label="Pending Dues" value={`₹${Number(revenueStats.pendingDues).toLocaleString()}`} />
        )}
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>⚡ Quick Actions</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/students">➕ Add Student</Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/teachers">➕ Add Teacher</Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/batches">➕ Create Batch</Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/attendance">📅 Take Attendance</Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/enrollments">📋 Manage Enrollments</Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/reports">📊 View Reports</Link>
        </div>
      </div>

      {/* Recent Attendance Sessions */}
      {Array.isArray(recentSessions) && recentSessions.length > 0 && (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>📅 Recent Attendance Sessions</div>
            <Link className="button secondary" style={{ width: "auto", fontSize: 12 }} to="/center/attendance">View All</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Entries</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.slice(0, 5).map((s) => (
                  <tr key={s.id}>
                    <td>{s.date ? new Date(s.date).toLocaleDateString() : "—"}</td>
                    <td>{s.batch?.name || s.batchName || "—"}</td>
                    <td>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: s.status === "PUBLISHED" ? "var(--color-bg-success-light)" : s.status === "LOCKED" ? "var(--color-bg-info-light)" : s.status === "DRAFT" ? "var(--color-bg-warning)" : "var(--color-bg-muted)",
                        color: s.status === "PUBLISHED" ? "var(--color-text-success)" : s.status === "LOCKED" ? "var(--color-text-info)" : s.status === "DRAFT" ? "var(--color-text-warning)" : "var(--color-text-muted)"
                      }}>
                        {s.status || "—"}
                      </span>
                    </td>
                    <td>{s.entryCount ?? s._count?.entries ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ marginTop: 0 }}>Center Profile</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Read-only center identity and status.</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Center Code</div>
            <div style={{ fontWeight: 700 }}>{centerProfile?.code || me?.username || ""}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Center Name</div>
            <div style={{ fontWeight: 700 }}>{centerProfile?.displayName || centerProfile?.name || me?.hierarchyNode?.name || ""}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</div>
            <div style={{ fontWeight: 700 }}>{centerProfile?.status || (me?.isActive ? "ACTIVE" : "INACTIVE")}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Phone</div>
            <div style={{ fontWeight: 700 }}>{centerProfile?.phonePrimary || ""}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Email</div>
            <div style={{ fontWeight: 700 }}>{centerProfile?.emailOfficial || me?.email || ""}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }} id="mock-tests" ref={mockTestsSectionRef}>
        <h3 style={{ marginTop: 0 }}>Mock Tests</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create mock tests and record student marks.</div>

        <form onSubmit={onCreateMockTest} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Batch
              <select
                className="select"
                value={batchId}
                onChange={(e) => {
                  const next = e.target.value;
                  setBatchId(next);
                  setSelectedTestId("");
                  setSelectedTest(null);
                  void loadMockTests(next);
                }}
              >
                <option value="">Select batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Date
              <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
            </label>
            <label>
              Max Marks
              <input className="input" value={maxMarks} onChange={(e) => setMaxMarks(Number(e.target.value) || 0)} />
            </label>
            <label>
              Online Worksheet (Optional)
              <select className="select" value={worksheetId} onChange={(e) => setWorksheetId(e.target.value)}>
                <option value="">Manual marking only</option>
                {worksheets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="button" style={{ width: "auto" }} disabled={creating}>
            {creating ? "Creating..." : "Create Mock Test"}
          </button>
        </form>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Mock tests</div>
          <DataTable
            columns={[
              { key: "date", header: "Date", render: (r) => String(r?.date || "").slice(0, 10) },
              { key: "title", header: "Title", render: (r) => r?.title || "" },
              {
                key: "mode",
                header: "Mode",
                render: (r) => (r?.worksheetId ? "Online + Manual" : "Manual")
              },
              { key: "maxMarks", header: "Max", render: (r) => r?.maxMarks ?? "" },
              {
                key: "status",
                header: "Status",
                render: (r) => {
                  const status = r?.status || "DRAFT";
                  return (
                    <span
                      style={{
                        ...getMockTestStatusStyle(status),
                        padding: "2px 8px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700
                      }}
                    >
                      {status}
                    </span>
                  );
                }
              },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <button
                    className="button secondary"
                    style={{ width: "auto" }}
                    onClick={() => {
                      setSelectedTestId(r.id);
                      void loadSelectedTest(r.id);
                    }}
                  >
                    Select
                  </button>
                )
              }
            ]}
            rows={mockTests}
            keyField="id"
          />
          {!mockTests.length ? <div style={{ color: "var(--color-text-muted)" }}>No mock tests created yet.</div> : null}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Results</div>
          {!selectedTest ? (
            <div style={{ color: "var(--color-text-muted)" }}>Select a mock test.</div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Status: {selectedTest.status || "DRAFT"}
                {isSelectedTestArchived ? " • Archived tests are read-only." : ""}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  disabled={updatingStatus || selectedTest.status === "DRAFT"}
                  onClick={() => void onUpdateSelectedTestStatus("DRAFT")}
                >
                  Set Draft
                </button>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  disabled={updatingStatus || selectedTest.status === "PUBLISHED"}
                  onClick={() => void onUpdateSelectedTestStatus("PUBLISHED")}
                >
                  Publish
                </button>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  disabled={updatingStatus || selectedTest.status === "ARCHIVED"}
                  onClick={() => void onUpdateSelectedTestStatus("ARCHIVED")}
                >
                  Archive
                </button>
              </div>
              <DataTable
                columns={[
                  { key: "student", header: "Student", render: (r) => `${r?.student?.firstName || ""} ${r?.student?.lastName || ""}`.trim() },
                  { key: "admissionNo", header: "Admission", render: (r) => r?.student?.admissionNo || "" },
                  {
                    key: "marks",
                    header: "Marks",
                    render: (r) => (
                      <input
                        className="input"
                        style={{ minWidth: 120 }}
                        value={marksByStudentId[r.studentId] ?? ""}
                        disabled={isSelectedTestArchived}
                        onChange={(e) => {
                          const next = { ...marksByStudentId };
                          next[r.studentId] = e.target.value;
                          setMarksByStudentId(next);
                        }}
                      />
                    )
                  }
                ]}
                rows={rosterRows}
                keyField="studentId"
              />
              <button className="button" style={{ width: "auto" }} disabled={savingResults || isSelectedTestArchived} onClick={onSaveResults}>
                {savingResults ? "Saving..." : "Save Results"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Version v1.0.2</div>
    </section>
  );
}

export { CenterDashboardPage };
