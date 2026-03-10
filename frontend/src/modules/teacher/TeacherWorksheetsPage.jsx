import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listCatalogCourseLevels, listCatalogCourses } from "../../services/catalogService";
import { listWorksheets } from "../../services/worksheetsService";
import {
  assignWorksheetToBatch,
  bulkAssignWorksheetToStudents,
  getTeacherBatchWorksheetsContext,
  listMyBatches,
  listMyStudents
} from "../../services/teacherPortalService";

function extractItems(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.data?.items)) return resp.data.items;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.items)) return resp.items;
  return [];
}

function nextWeekStr() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function TeacherWorksheetsPage() {
  const [pageLoading, setPageLoading] = useState(true);
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [batchWorksheetsLoading, setBatchWorksheetsLoading] = useState(false);
  const [batchWorksheets, setBatchWorksheets] = useState([]);
  const [worksheetId, setWorksheetId] = useState("");
  const [dueDate, setDueDate] = useState(nextWeekStr());

  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [levelsLoading, setLevelsLoading] = useState(false);
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null);

  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheets, setWorksheets] = useState([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [students, setStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [bulkWorksheetId, setBulkWorksheetId] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState(nextWeekStr());
  const [bulkAssigning, setBulkAssigning] = useState(false);

  const batchMap = useMemo(() => new Map(batches.map((b) => [b.batchId, b])), [batches]);
  const selectedBatch = batchMap.get(batchId) || null;

  const loadPage = async () => {
    setPageLoading(true);
    setError("");
    try {
      const [batchResp, courseResp, studentResp] = await Promise.all([
        listMyBatches(),
        listCatalogCourses({ limit: 100, offset: 0, status: "ACTIVE" }),
        listMyStudents()
      ]);

      const batchItems = extractItems(batchResp);
      const courseItems = extractItems(courseResp);
      const studentItems = extractItems(studentResp);

      setBatches(batchItems);
      setCourses(courseItems);
      setStudents(studentItems);
      if (batchItems.length) setBatchId(batchItems[0].batchId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load worksheets workspace.");
      setBatches([]);
      setCourses([]);
    } finally {
      setPageLoading(false);
    }
  };

  const loadBatchWorksheets = async (nextBatchId) => {
    const id = nextBatchId || batchId;
    if (!id) {
      setBatchWorksheets([]);
      return;
    }

    setBatchWorksheetsLoading(true);
    setError("");
    try {
      const data = await getTeacherBatchWorksheetsContext(id);
      setBatchWorksheets(data?.data?.worksheets || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load batch worksheets.");
      setBatchWorksheets([]);
    } finally {
      setBatchWorksheetsLoading(false);
    }
  };

  const loadLevels = async (course) => {
    if (!course?.id) return;
    setLevelsLoading(true);
    setError("");
    try {
      const resp = await listCatalogCourseLevels({ courseId: course.id, limit: 100, offset: 0, status: "ACTIVE" });
      setLevels(resp?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load levels.");
      setLevels([]);
    } finally {
      setLevelsLoading(false);
    }
  };

  const loadWorksheets = async (levelRow) => {
    const levelId = levelRow?.level?.id;
    if (!levelId) {
      setWorksheets([]);
      return;
    }
    setWorksheetsLoading(true);
    setError("");
    try {
      const resp = await listWorksheets({ levelId, limit: 100, offset: 0 });
      setWorksheets(resp?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load worksheets.");
      setWorksheets([]);
    } finally {
      setWorksheetsLoading(false);
    }
  };

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    setWorksheetId("");
    if (batchId) void loadBatchWorksheets(batchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  if (pageLoading) {
    return <LoadingState label="Loading worksheets..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Worksheets</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Assign worksheets to your batches and browse the catalog.</div>
      </div>

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
        <div>
          <h3 style={{ margin: 0 }}>Assign Worksheet to Batch</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Use this to quickly assign a worksheet to all active students in your batch.</div>
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

        {selectedBatch ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: {selectedBatch.status} • Active students: {selectedBatch.activeStudentCount ?? 0}
          </div>
        ) : null}

        <label>
          Worksheet
          <select
            className="select"
            value={worksheetId}
            onChange={(e) => setWorksheetId(e.target.value)}
            disabled={!batchId || batchWorksheetsLoading}
          >
            <option value="">Select worksheet</option>
            {batchWorksheets.map((w) => (
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

        <button
          className="button"
          disabled={!batchId || !worksheetId || !dueDate || savingAssignment}
          onClick={async () => {
            setSavingAssignment(true);
            setError("");
            setSuccess("");
            try {
              const data = await assignWorksheetToBatch(batchId, { worksheetId, dueDate });
              setSuccess(`Worksheet assigned to ${data?.data?.assignedCount || 0} students.`);
            } catch (err) {
              setError(getFriendlyErrorMessage(err) || "Failed to assign worksheet.");
            } finally {
              setSavingAssignment(false);
            }
          }}
        >
          {savingAssignment ? "Assigning..." : "Assign Worksheet"}
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Assign Worksheet to Multiple Students</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pick one worksheet and assign it to selected students.</div>
        </div>

        <label>
          Worksheet
          <select
            className="select"
            value={bulkWorksheetId}
            onChange={(e) => setBulkWorksheetId(e.target.value)}
            disabled={!batchId || batchWorksheetsLoading}
          >
            <option value="">Select worksheet</option>
            {batchWorksheets.map((w) => (
              <option key={w.worksheetId} value={w.worksheetId}>
                {w.number}. {w.title}{w.levelLabel ? ` (${w.levelLabel})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Due Date
          <input className="input" type="date" value={bulkDueDate} onChange={(e) => setBulkDueDate(e.target.value)} />
        </label>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Students ({selectedStudentIds.size} selected)</span>
            <span>
              <button
                className="button secondary"
                style={{ width: "auto", marginRight: 4, fontSize: 12, padding: "2px 8px" }}
                onClick={() => setSelectedStudentIds(new Set(students.map((s) => s.studentId || s.id)))}
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
          <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, padding: 6 }}>
            {students.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: 8 }}>No students found.</div>
            ) : (
              students.map((s) => {
                const sid = s.studentId || s.id;
                return (
                  <label key={sid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.has(sid)}
                      onChange={() => {
                        setSelectedStudentIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(sid)) next.delete(sid);
                          else next.add(sid);
                          return next;
                        });
                      }}
                    />
                    <span style={{ fontSize: 13 }}>
                      {s.firstName || ""} {s.lastName || ""}{s.enrollmentId ? ` (${s.enrollmentId})` : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <button
          className="button"
          disabled={!bulkWorksheetId || !bulkDueDate || selectedStudentIds.size === 0 || bulkAssigning}
          onClick={async () => {
            setBulkAssigning(true);
            setError("");
            setSuccess("");
            try {
              const resp = await bulkAssignWorksheetToStudents({
                worksheetId: bulkWorksheetId,
                studentIds: [...selectedStudentIds],
                dueDate: bulkDueDate
              });
              const results = resp?.data?.results || resp?.results || [];
              const okCount = results.filter((r) => r.success).length;
              const failCount = results.filter((r) => !r.success).length;
              setSuccess(`Bulk assign complete: ${okCount} succeeded${failCount ? `, ${failCount} failed` : ""}.`);
              setSelectedStudentIds(new Set());
            } catch (err) {
              setError(getFriendlyErrorMessage(err) || "Bulk assignment failed.");
            } finally {
              setBulkAssigning(false);
            }
          }}
        >
          {bulkAssigning ? "Assigning..." : `Assign to ${selectedStudentIds.size} Student${selectedStudentIds.size !== 1 ? "s" : ""}`}
        </button>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Catalog Courses</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Read-only worksheet explorer by course and level.</div>
      </div>
      <DataTable
        columns={[
          { key: "code", header: "Code", render: (r) => r.code },
          { key: "name", header: "Name", render: (r) => r.name },
          { key: "status", header: "Status", render: (r) => r.status || (r.isActive ? "ACTIVE" : "ARCHIVED") },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <button
                className={selectedCourse?.id === r.id ? "button" : "button secondary"}
                style={{ width: "auto" }}
                onClick={() => {
                  setSelectedCourse(r);
                  setSelectedLevel(null);
                  setWorksheets([]);
                  void loadLevels(r);
                }}
              >
                Levels
              </button>
            )
          }
        ]}
        rows={courses}
        keyField="id"
      />

      {selectedCourse ? (
        <>
          <div style={{ marginTop: 4 }}>
            <h3 style={{ margin: 0 }}>Levels for {selectedCourse.code} - {selectedCourse.name}</h3>
          </div>
          {levelsLoading ? (
            <LoadingState label="Loading levels..." />
          ) : (
            <DataTable
              columns={[
                { key: "levelNumber", header: "Level", render: (r) => r.levelNumber },
                { key: "title", header: "Title", render: (r) => r.level?.name || r.title },
                { key: "status", header: "Status", render: (r) => r.status || (r.isActive ? "ACTIVE" : "ARCHIVED") },
                {
                  key: "actions",
                  header: "Actions",
                  render: (r) => (
                    <button
                      className={selectedLevel?.id === r.id ? "button" : "button secondary"}
                      style={{ width: "auto" }}
                      onClick={() => {
                        setSelectedLevel(r);
                        void loadWorksheets(r);
                      }}
                      disabled={!r.level?.id}
                      title={!r.level?.id ? "No matching Level record for this course level." : ""}
                    >
                      Worksheets
                    </button>
                  )
                }
              ]}
              rows={levels}
              keyField="id"
            />
          )}
        </>
      ) : null}

      {selectedCourse && selectedLevel ? (
        <>
          <div style={{ marginTop: 4 }}>
            <h3 style={{ margin: 0 }}>
              Worksheets for Level {selectedLevel.levelNumber} - {selectedLevel.level?.name || selectedLevel.title}
            </h3>
          </div>

          {worksheetsLoading ? (
            <LoadingState label="Loading worksheets..." />
          ) : (
            <>
              <DataTable
                columns={[
                  { key: "number", header: "Number", render: (r) => r.number },
                  { key: "title", header: "Title", render: (r) => r.title },
                  { key: "questionCount", header: "Questions", render: (r) => r.questionCount ?? 0 },
                  { key: "status", header: "Status", render: (r) => (r.isPublished ? "PUBLISHED" : "DRAFT") },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (r) => (
                      <button
                        className="button secondary"
                        style={{ width: "auto" }}
                        onClick={() => {
                          if (!batchId) {
                            setError("Select a batch first in 'Assign Worksheet to Batch'.");
                            return;
                          }
                          setError("");
                          // If not already in the worksheet dropdown, inject it so it appears in both forms
                          if (!batchWorksheets.some((w) => w.worksheetId === r.id)) {
                            setBatchWorksheets((prev) => [
                              ...prev,
                              {
                                worksheetId: r.id,
                                number: prev.length + 1,
                                title: r.title,
                                levelLabel: selectedLevel?.level?.name || selectedLevel?.title || ""
                              }
                            ]);
                          }
                          setWorksheetId(r.id);
                          setBulkWorksheetId(r.id);
                          setSuccess(`Selected: ${r.title} — choose an assignment form above.`);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        title="Use this worksheet in the assignment forms above"
                      >
                        Use
                      </button>
                    )
                  }
                ]}
                rows={worksheets.map((w, i) => ({ ...w, number: i + 1 }))}
                keyField="id"
              />
              {!worksheets.length ? (
                <div className="card" style={{ color: "var(--color-text-muted)" }}>
                  No worksheets available.
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export { TeacherWorksheetsPage };
