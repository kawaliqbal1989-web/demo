import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  assignWorksheetToSelectedStudentsInBatch,
  assignWorksheetToBatch,
  getBatchRoster,
  getTeacherBatchWorksheetsContext,
  getTeacherMockTest,
  listMyBatches,
  listTeacherBatchMockTests,
  saveTeacherMockTestResults
} from "../../services/teacherPortalService";
import { getWorksheet } from "../../services/worksheetsService";
import { WorksheetPreviewModal } from "./components/WorksheetPreviewModal";

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

function TeacherBatchesPage() {
  const [searchParams] = useSearchParams();
  const initialBatchId = searchParams.get("batchId") || "";
  const initialWorksheetId = searchParams.get("worksheetId") || "";
  const mockTestsSectionRef = useRef(null);
  const initialWorksheetAppliedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState(initialBatchId);

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheets, setWorksheets] = useState([]);
  const [worksheetId, setWorksheetId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigningWorksheet, setAssigningWorksheet] = useState(false);
  const [studentWorksheetId, setStudentWorksheetId] = useState("");
  const [studentDueDate, setStudentDueDate] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [assigningToStudents, setAssigningToStudents] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewWorksheet, setPreviewWorksheet] = useState(null);

  const [mockTestsLoading, setMockTestsLoading] = useState(false);
  const [mockTests, setMockTests] = useState([]);
  const [mockTestId, setMockTestId] = useState("");
  const [selectedMockTest, setSelectedMockTest] = useState(null);
  const [loadingMockTest, setLoadingMockTest] = useState(false);
  const [savingResults, setSavingResults] = useState(false);
  const [marksByStudentId, setMarksByStudentId] = useState({});
  const isSelectedMockTestArchived = selectedMockTest?.status === "ARCHIVED";

  const batchMap = useMemo(() => new Map(batches.map((b) => [b.batchId, b])), [batches]);
  const selectedBatch = batchMap.get(batchId) || null;

  const nextWeekStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  };

  const openWorksheetPreview = async (targetWorksheetId, labelMeta = {}) => {
    const id = String(targetWorksheetId || "").trim();
    if (!id) return;

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewWorksheet(null);

    try {
      const response = await getWorksheet(id);
      const payload = response?.data || response;
      setPreviewWorksheet({
        ...payload,
        __courseLabel: labelMeta.courseLabel || "N/A",
        __levelLabel: labelMeta.levelLabel || payload?.level?.name || "N/A",
        __statusLabel: payload?.isPublished ? "PUBLISHED" : "DRAFT"
      });
    } catch (err) {
      setPreviewError(getFriendlyErrorMessage(err) || "Failed to load worksheet preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const b = await listMyBatches();
      const items = b.data || [];
      setBatches(items);
      if (!batchId && items.length) {
        setBatchId(items[0].batchId);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load batches.");
    } finally {
      setLoading(false);
    }
  };

  const loadRoster = async (nextBatchId) => {
    const id = nextBatchId || batchId;
    if (!id) {
      setRoster([]);
      return;
    }

    setRosterLoading(true);
    setError("");
    try {
      const data = await getBatchRoster(id);
      setRoster(data.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load roster.");
    } finally {
      setRosterLoading(false);
    }
  };

  const loadWorksheets = async (nextBatchId) => {
    const id = nextBatchId || batchId;
    if (!id) {
      setWorksheets([]);
      return;
    }

    setWorksheetsLoading(true);
    setError("");
    try {
      const data = await getTeacherBatchWorksheetsContext(id);
      setWorksheets(data?.data?.worksheets || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load worksheets.");
      setWorksheets([]);
    } finally {
      setWorksheetsLoading(false);
    }
  };

  const loadMockTests = async (nextBatchId) => {
    const id = nextBatchId || batchId;
    if (!id) {
      setMockTests([]);
      return;
    }

    setMockTestsLoading(true);
    setError("");
    try {
      const data = await listTeacherBatchMockTests(id);
      setMockTests(data?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load mock tests.");
      setMockTests([]);
    } finally {
      setMockTestsLoading(false);
    }
  };

  const loadMockTestDetails = async (id) => {
    if (!id) {
      setSelectedMockTest(null);
      setMarksByStudentId({});
      return;
    }

    setLoadingMockTest(true);
    setError("");
    try {
      const data = await getTeacherMockTest(id);
      const payload = data?.data || null;
      const nextMarks = {};
      (payload?.roster || []).forEach((row) => {
        nextMarks[row.studentId] = row?.marks ?? "";
      });
      setSelectedMockTest(payload);
      setMarksByStudentId(nextMarks);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load mock test.");
      setSelectedMockTest(null);
      setMarksByStudentId({});
    } finally {
      setLoadingMockTest(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setWorksheetId("");
    setStudentWorksheetId("");
    setStudentDueDate(nextWeekStr());
    setSelectedStudentIds(new Set());
    setMockTestId("");
    setSelectedMockTest(null);
    setMarksByStudentId({});
    if (batchId) {
      void loadRoster(batchId);
      void loadWorksheets(batchId);
      void loadMockTests(batchId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    if (initialWorksheetAppliedRef.current || !initialWorksheetId || !worksheets.length) {
      return;
    }
    const exists = worksheets.some((w) => String(w.worksheetId) === String(initialWorksheetId));
    if (!exists) {
      initialWorksheetAppliedRef.current = true;
      return;
    }
    setWorksheetId(initialWorksheetId);
    setStudentWorksheetId(initialWorksheetId);
    initialWorksheetAppliedRef.current = true;
  }, [initialWorksheetId, worksheets]);

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

  if (loading) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="My Batches" subtitle="Batches assigned to you and their students." />

      {!batches.length ? <div className="card" style={{ color: "var(--color-text-muted)" }}>No batches assigned yet.</div> : null}

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="card" style={{ color: "var(--color-text-success)" }}>
          {success}
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>
          Batch
          <select className="select" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Select</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {selectedBatch ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: {selectedBatch.status} • Active students: {selectedBatch.activeStudentCount}
          </div>
        ) : null}
      </div>

      {!batchId ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>Select a batch to view its roster.</div>
      ) : rosterLoading ? (
        <SkeletonLoader variant="list" rows={4} />
      ) : (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Batch Roster (read-only)</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Active enrollments assigned to you in this batch.</div>
          <DataTable
            columns={[
              { key: "fullName", header: "Student", render: (r) => r.fullName || "" },
              { key: "level", header: "Level", render: (r) => (r.level ? `${r.level.name} / ${r.level.rank}` : "") },
              { key: "guardianPhone", header: "Guardian Phone", render: (r) => r.guardianPhone || "" },
              { key: "status", header: "Status", render: (r) => r.status || "" }
            ]}
            rows={roster}
            keyField="enrollmentId"
          />
        </div>
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Assign Worksheet to Batch</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Assign worksheets to your batches.</div>
        </div>

        <label>
          Batch
          <select className="select" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Select batch</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Worksheet
          <select className="select" value={worksheetId} onChange={(e) => setWorksheetId(e.target.value)} disabled={!batchId || worksheetsLoading}>
            <option value="">Select worksheet</option>
            {worksheets.map((w) => (
              <option key={w.worksheetId} value={w.worksheetId}>
                {w.number}. {w.title}{w.levelLabel ? ` (${w.levelLabel})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Due Date
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>

        <div>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            disabled={!worksheetId}
            onClick={() => {
              const selectedWorksheet = worksheets.find((w) => w.worksheetId === worksheetId);
              void openWorksheetPreview(worksheetId, {
                levelLabel: selectedWorksheet?.levelLabel || "N/A"
              });
            }}
          >
            👁 Preview Selected Worksheet
          </button>
        </div>

        <button
          className="button"
          disabled={!batchId || !worksheetId || !dueDate || assigningWorksheet}
          onClick={async () => {
            setAssigningWorksheet(true);
            setError("");
            setSuccess("");
            try {
              const data = await assignWorksheetToBatch(batchId, { worksheetId, dueDate });
              setSuccess(`Worksheet assigned to ${data?.data?.assignedCount || 0} students.`);
            } catch (err) {
              setError(getFriendlyErrorMessage(err) || "Failed to assign worksheet.");
            } finally {
              setAssigningWorksheet(false);
            }
          }}
        >
          {assigningWorksheet ? "Assigning..." : "Assign Worksheet"}
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Assign Worksheet to Students</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Assign one worksheet to selected students in the chosen batch.
          </div>
        </div>

        <label>
          Worksheet
          <select
            className="select"
            value={studentWorksheetId}
            onChange={(e) => setStudentWorksheetId(e.target.value)}
            disabled={!batchId || worksheetsLoading}
          >
            <option value="">Select worksheet</option>
            {worksheets.map((w) => (
              <option key={w.worksheetId} value={w.worksheetId}>
                {w.number}. {w.title}{w.levelLabel ? ` (${w.levelLabel})` : ""}
              </option>
            ))}
          </select>
        </label>

        <div>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            disabled={!studentWorksheetId}
            onClick={() => {
              const selectedWorksheet = worksheets.find((w) => w.worksheetId === studentWorksheetId);
              void openWorksheetPreview(studentWorksheetId, {
                levelLabel: selectedWorksheet?.levelLabel || "N/A"
              });
            }}
          >
            👁 Preview Selected Worksheet
          </button>
        </div>

        <label>
          Due Date
          <input className="input" type="date" value={studentDueDate} onChange={(e) => setStudentDueDate(e.target.value)} />
        </label>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Students ({selectedStudentIds.size} selected)</span>
            <span>
              <button
                className="button secondary"
                style={{ width: "auto", marginRight: 4, fontSize: 12, padding: "2px 8px" }}
                disabled={!roster.length}
                onClick={() => {
                  setSelectedStudentIds(new Set(roster.map((r) => r.studentId)));
                }}
              >
                Select All
              </button>
              <button
                className="button secondary"
                style={{ width: "auto", fontSize: 12, padding: "2px 8px" }}
                onClick={() => setSelectedStudentIds(new Set())}
              >
                Clear
              </button>
            </span>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, padding: 6 }}>
            {!roster.length ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: 8 }}>No students found in this batch.</div>
            ) : (
              roster.map((row) => {
                const displayName = String(row.fullName || "").trim() || row.studentId;
                return (
                  <label
                    key={row.studentId}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.has(row.studentId)}
                      onChange={() => {
                        setSelectedStudentIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.studentId)) next.delete(row.studentId);
                          else next.add(row.studentId);
                          return next;
                        });
                      }}
                    />
                    <span style={{ fontSize: 13 }}>{displayName}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <button
          className="button"
          disabled={!studentWorksheetId || !studentDueDate || selectedStudentIds.size === 0 || assigningToStudents}
          onClick={async () => {
            setAssigningToStudents(true);
            setError("");
            setSuccess("");
            try {
              const resp = await assignWorksheetToSelectedStudentsInBatch(batchId, {
                worksheetId: studentWorksheetId,
                studentIds: [...selectedStudentIds],
                dueDate: studentDueDate
              });
              const results = resp?.data?.results || resp?.results || [];
              const okCount = results.filter((r) => r.success).length;
              const failCount = results.filter((r) => !r.success).length;
              setSuccess(`Student assignment complete: ${okCount} succeeded${failCount ? `, ${failCount} failed` : ""}.`);
              setSelectedStudentIds(new Set());
            } catch (err) {
              setError(getFriendlyErrorMessage(err) || "Failed to assign worksheet to students.");
            } finally {
              setAssigningToStudents(false);
            }
          }}
        >
          {assigningToStudents ? "Assigning..." : `Assign to ${selectedStudentIds.size} Student${selectedStudentIds.size === 1 ? "" : "s"}`}
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }} id="mock-tests" ref={mockTestsSectionRef}>
        <div>
          <h3 style={{ margin: 0 }}>Mock Tests</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Record marks for your batch mock tests.</div>
        </div>

        <label>
          Batch
          <select className="select" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Select batch</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Mock Test
          <select
            className="select"
            value={mockTestId}
            onChange={(e) => {
              const next = e.target.value;
              setMockTestId(next);
              void loadMockTestDetails(next);
            }}
            disabled={!batchId || mockTestsLoading}
          >
            <option value="">Select mock test</option>
            {mockTests.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} • {m.status || "DRAFT"}
              </option>
            ))}
          </select>
        </label>

        {!mockTests.length && batchId && !mockTestsLoading ? <div style={{ color: "var(--color-text-muted)" }}>No mock tests available.</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Student</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Marks</div>

          {!mockTestId ? (
            <div style={{ color: "var(--color-text-muted)" }}>Select a mock test.</div>
          ) : loadingMockTest ? (
            <SkeletonLoader variant="list" rows={3} />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</span>
                <span
                  style={{
                    ...getMockTestStatusStyle(selectedMockTest?.status || "DRAFT"),
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  {selectedMockTest?.status || "DRAFT"}
                </span>
                {isSelectedMockTestArchived ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Archived tests are read-only.</span>
                ) : null}
              </div>
              <DataTable
                columns={[
                  {
                    key: "student",
                    header: "Student",
                    render: (r) => `${r?.student?.firstName || ""} ${r?.student?.lastName || ""}`.trim()
                  },
                  {
                    key: "marks",
                    header: "Marks",
                    render: (r) => (
                      <input
                        className="input"
                        style={{ minWidth: 120 }}
                        value={marksByStudentId[r.studentId] ?? ""}
                        disabled={isSelectedMockTestArchived}
                        onChange={(e) => {
                          const next = { ...marksByStudentId };
                          next[r.studentId] = e.target.value;
                          setMarksByStudentId(next);
                        }}
                      />
                    )
                  }
                ]}
                rows={selectedMockTest?.roster || []}
                keyField="studentId"
              />

              <button
                className="button"
                disabled={savingResults || !selectedMockTest || isSelectedMockTestArchived}
                onClick={async () => {
                  if (!selectedMockTest) return;
                  setSavingResults(true);
                  setError("");
                  setSuccess("");
                  try {
                    await saveTeacherMockTestResults(
                      selectedMockTest.id,
                      (selectedMockTest.roster || []).map((r) => ({
                        studentId: r.studentId,
                        marks: marksByStudentId[r.studentId] === "" ? null : marksByStudentId[r.studentId]
                      }))
                    );
                    setSuccess("Results saved.");
                  } catch (err) {
                    setError(getFriendlyErrorMessage(err) || "Failed to save results.");
                  } finally {
                    setSavingResults(false);
                  }
                }}
              >
                {savingResults ? "Saving..." : "Save Results"}
              </button>
            </>
          )}
        </div>
      </div>

      <WorksheetPreviewModal
        open={previewOpen}
        loading={previewLoading}
        error={previewError}
        worksheet={previewWorksheet}
        onClose={() => setPreviewOpen(false)}
      />
    </section>
  );
}

export { TeacherBatchesPage };
