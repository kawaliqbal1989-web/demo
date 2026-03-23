import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { downloadBlob } from "../../utils/downloadBlob";
import { getApiErrorCode, getFriendlyErrorMessage } from "../../utils/apiErrors";
import { ATTENDANCE_STATUS_COLORS } from "../../utils/attendance";
import {
  createAttendanceSession,
  getAttendanceSession,
  getBatchAttendanceHistory,
  listAttendanceSessions,
  getBatchRoster,
  listMyBatches,
  exportBatchAttendanceHistoryCsv,
  publishAttendanceSession,
  updateAttendanceEntries
} from "../../services/teacherPortalService";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toIsoDateOnly(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const ENTRY_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

function hasAttendanceChanges(entries, localStatuses) {
  return entries.some((entry) => {
    const local = localStatuses[entry.studentId];
    if (!local) return false;
    return (local.status || entry.status) !== entry.status || (local.note || "") !== (entry.note || "");
  });
}

function renderAttendanceBadge(status) {
  const normalized = String(status || "").trim().toUpperCase();
  const colors = ATTENDANCE_STATUS_COLORS[normalized] || { bg: "var(--color-bg-muted)", fg: "var(--color-text-label)" };
  return (
    <span style={{ background: colors.bg, color: colors.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {normalized || "UNKNOWN"}
    </span>
  );
}

function TeacherAttendancePage() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historySessionStatus, setHistorySessionStatus] = useState("");
  const [historyLimit, setHistoryLimit] = useState(10);
  const [historyOffset, setHistoryOffset] = useState(0);

  const [session, setSession] = useState(null);
  const [localStatuses, setLocalStatuses] = useState({});

  const [quickStudents, setQuickStudents] = useState([]);
  const [loadingQuickStudents, setLoadingQuickStudents] = useState(false);

  const [historyItems, setHistoryItems] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExporting, setHistoryExporting] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [bulkNoteOpen, setBulkNoteOpen] = useState(false);

  const entries = useMemo(() => session?.entries || [], [session]);
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;

    return entries.filter((entry) => {
      const fullName = String(entry?.fullName || "").toLowerCase();
      const admissionNo = String(entry?.admissionNo || "").toLowerCase();
      return fullName.includes(query) || admissionNo.includes(query);
    });
  }, [entries, search]);
  const pagedEntries = useMemo(
    () => filteredEntries.slice(offset, offset + limit),
    [filteredEntries, offset, limit]
  );

  const hydrateLocal = (nextSession) => {
    const map = {};
    for (const e of nextSession?.entries || []) {
      map[e.studentId] = { status: e.status, note: e.note || "" };
    }
    setLocalStatuses(map);
    setSearch("");
    setOffset(0);
  };

  useEffect(() => {
    setOffset(0);
  }, [search, batchId, date, limit]);

  useEffect(() => {
    setHistoryOffset(0);
  }, [batchId, historyFrom, historyTo, historySessionStatus, historyLimit]);

  useEffect(() => {
    if (offset >= filteredEntries.length && filteredEntries.length > 0) {
      setOffset(Math.max(0, Math.floor((filteredEntries.length - 1) / limit) * limit));
    }
  }, [filteredEntries.length, limit, offset]);

  const loadBatches = async () => {
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

  const loadQuickStudents = async (nextBatchId) => {
    if (!nextBatchId) {
      setQuickStudents([]);
      return;
    }

    setLoadingQuickStudents(true);
    try {
      const response = await getBatchRoster(nextBatchId);
      const data = response?.data || response || [];
      const items = Array.isArray(data) ? data : [];
      setQuickStudents(items);
    } catch {
      setQuickStudents([]);
    } finally {
      setLoadingQuickStudents(false);
    }
  };

  const loadBatchHistory = async (nextBatchId = batchId) => {
    if (!nextBatchId) {
      setHistoryItems([]);
      setHistoryTotal(0);
      setHistoryError("");
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await getBatchAttendanceHistory({
        batchId: nextBatchId,
        from: historyFrom || undefined,
        to: historyTo || undefined,
        sessionStatus: historySessionStatus || undefined,
        limit: historyLimit,
        offset: historyOffset
      });
      const data = response?.data || response || {};
      setHistoryItems(Array.isArray(data.items) ? data.items : []);
      setHistoryTotal(Number(data.total || 0));
    } catch (err) {
      setHistoryItems([]);
      setHistoryTotal(0);
      setHistoryError(getFriendlyErrorMessage(err) || "Failed to load batch history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const findOrClearSession = async ({ nextBatchId = batchId, nextDate = date } = {}) => {
    if (!nextBatchId || !nextDate) {
      setSession(null);
      setLocalStatuses({});
      return;
    }

    setLoadingSession(true);
    setError("");
    setInfo("");

    try {
      const list = await listAttendanceSessions({ batchId: nextBatchId, date: nextDate, limit: 5, offset: 0 });
      const items = list.data?.items || [];
      if (!items.length) {
        setSession(null);
        setLocalStatuses({});
        return;
      }

      const sessionId = items[0].sessionId;
      const detail = await getAttendanceSession(sessionId);
      setSession(detail.data);
      hydrateLocal(detail.data);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load session.");
    } finally {
      setLoadingSession(false);
    }
  };

  useEffect(() => {
    void loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void findOrClearSession({ nextBatchId: batchId, nextDate: date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, date]);

  useEffect(() => {
    void loadQuickStudents(batchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    void loadBatchHistory(batchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, historyFrom, historyTo, historySessionStatus, historyLimit, historyOffset]);

  const onCreateSession = async () => {
    if (!batchId || !date) return;

    setSaving(true);
    setError("");
    setInfo("");

    try {
      // Avoid creating duplicates (and avoid 409 noise) by checking first.
      const existing = await listAttendanceSessions({ batchId, date, limit: 1, offset: 0 });
      const items = existing?.data?.items || [];
      if (items.length) {
        setInfo("Session already exists. Opening it...");
        await findOrClearSession({ nextBatchId: batchId, nextDate: date });
        return;
      }

      await createAttendanceSession({ batchId, date });
      setInfo("Session created.");
      await findOrClearSession({ nextBatchId: batchId, nextDate: date });
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === "SESSION_ALREADY_EXISTS") {
        setError("");
        setInfo("Session already exists. Opening it...");
        await findOrClearSession({ nextBatchId: batchId, nextDate: date });
        return;
      }

      setError(getFriendlyErrorMessage(err) || "Failed to create session.");
    } finally {
      setSaving(false);
    }
  };

  const canEdit = session?.status === "DRAFT" || session?.status === "PUBLISHED";

  const setAll = (status) => {
    const next = { ...localStatuses };
    for (const e of entries) {
      next[e.studentId] = { status, note: next[e.studentId]?.note || "" };
    }
    setLocalStatuses(next);
  };

  const setNoteForAll = (note) => {
    const next = { ...localStatuses };
    for (const e of entries) {
      next[e.studentId] = { status: next[e.studentId]?.status || e.status, note };
    }
    setLocalStatuses(next);
  };

  const onSave = async () => {
    if (!session) return;

    setSaving(true);
    setError("");
    setInfo("");

    const payload = {
      version: session.version,
      entries: Object.entries(localStatuses).map(([studentId, v]) => ({
        studentId,
        status: v.status,
        note: v.note || undefined
      }))
    };

    try {
      const res = await updateAttendanceEntries(session.sessionId, payload);
      const newVersion = res.data?.version;
      setInfo(`Saved. Version ${newVersion}`);
      await findOrClearSession({ nextBatchId: batchId, nextDate: date });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentDraft = async () => {
    if (!session) return session;

    const payload = {
      version: session.version,
      entries: Object.entries(localStatuses).map(([studentId, v]) => ({
        studentId,
        status: v.status,
        note: v.note || undefined
      }))
    };

    await updateAttendanceEntries(session.sessionId, payload);
    const refreshed = await getAttendanceSession(session.sessionId);
    setSession(refreshed.data);
    hydrateLocal(refreshed.data);
    return refreshed.data;
  };

  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

  const onExportBatchHistory = async () => {
    if (!batchId) return;

    setHistoryExporting(true);
    setHistoryError("");
    try {
      const response = await exportBatchAttendanceHistoryCsv({
        batchId,
        from: historyFrom || undefined,
        to: historyTo || undefined,
        sessionStatus: historySessionStatus || undefined,
        limit: 5000,
        offset: 0
      });
      downloadBlob(response.data, `teacher_batch_attendance_${batchId}.csv`);
    } catch (err) {
      setHistoryError(getFriendlyErrorMessage(err) || "Failed to export batch history CSV.");
    } finally {
      setHistoryExporting(false);
    }
  };

  const onPublish = async () => {
    if (!session) return;
    setPublishConfirmOpen(false);

    setSaving(true);
    setError("");
    setInfo("");

    try {
      if (hasAttendanceChanges(entries, localStatuses)) {
        await saveCurrentDraft();
      }
      await publishAttendanceSession(session.sessionId);
      setInfo("Published.");
      await findOrClearSession({ nextBatchId: batchId, nextDate: date });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading attendance..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Attendance</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Select batch + date, then mark roll-call</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {info ? (
        <div className="card">
          <p style={{ color: "var(--color-text-success)", fontWeight: 700, margin: 0 }}>{info}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10 }}>
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

          <label>
            Date
            <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </label>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Quick student-wise history access</div>
          {!batchId ? (
            <div style={{ color: "var(--color-text-muted)" }}>Select a batch to open student attendance history quickly.</div>
          ) : loadingQuickStudents ? (
            <div style={{ color: "var(--color-text-muted)" }}>Loading students…</div>
          ) : quickStudents.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {quickStudents.slice(0, 16).map((student) => (
                <Link
                  key={student.studentId}
                  className="button secondary"
                  style={{ width: "auto" }}
                  to={`/teacher/students/${student.studentId}/attendance`}
                >
                  {student.fullName || "Student"}
                </Link>
              ))}
              {quickStudents.length > 16 ? (
                <span style={{ alignSelf: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
                  +{quickStudents.length - 16} more students
                </span>
              ) : null}
            </div>
          ) : (
            <div style={{ color: "var(--color-text-muted)" }}>No students found for this batch.</div>
          )}
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>Batch Attendance History</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Open any previous session or export summary CSV</div>
            </div>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              disabled={!batchId || historyExporting}
              onClick={() => void onExportBatchHistory()}
            >
              {historyExporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>From</span>
              <input className="input" type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>To</span>
              <input className="input" type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
            </label>
            <label>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Session status</span>
              <select className="select" value={historySessionStatus} onChange={(e) => setHistorySessionStatus(e.target.value)}>
                <option value="">All</option>
                <option value="DRAFT">DRAFT</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="LOCKED">LOCKED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </label>
            <label>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Rows</span>
              <select className="select" value={historyLimit} onChange={(e) => setHistoryLimit(parseInt(e.target.value, 10) || 10)}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>
            {(historyFrom || historyTo || historySessionStatus) ? (
              <button
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => {
                  setHistoryFrom("");
                  setHistoryTo("");
                  setHistorySessionStatus("");
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          {historyError ? <p className="error" style={{ margin: 0 }}>{historyError}</p> : null}

          {!batchId ? (
            <div style={{ color: "var(--color-text-muted)" }}>Select a batch to view history.</div>
          ) : historyLoading ? (
            <div style={{ color: "var(--color-text-muted)" }}>Loading history…</div>
          ) : historyItems.length === 0 ? (
            <div style={{ color: "var(--color-text-muted)" }}>No attendance sessions found for these filters.</div>
          ) : (
            <>
              <DataTable
                columns={[
                  {
                    key: "date",
                    header: "Date",
                    render: (row) => (row.date ? new Date(row.date).toLocaleDateString() : "—")
                  },
                  { key: "sessionStatus", header: "Session" },
                  { key: "totalStudents", header: "Students" },
                  { key: "presentCount", header: "Present" },
                  { key: "absentCount", header: "Absent" },
                  { key: "lateCount", header: "Late" },
                  { key: "excusedCount", header: "Excused" },
                  {
                    key: "attendanceRate",
                    header: "Rate",
                    render: (row) => `${row.attendanceRate || 0}%`
                  },
                  {
                    key: "open",
                    header: "Open",
                    render: (row) => (
                      <button
                        className="button secondary"
                        style={{ width: "auto" }}
                        onClick={() => {
                          const sessionDate = toIsoDateOnly(row.date);
                          if (!sessionDate) return;
                          setDate(sessionDate);
                        }}
                      >
                        Open Session
                      </button>
                    )
                  }
                ]}
                rows={historyItems}
                keyField="sessionId"
              />

              <PaginationBar
                limit={historyLimit}
                offset={historyOffset}
                count={historyItems.length}
                total={historyTotal}
                onChange={(next) => {
                  setHistoryLimit(next.limit);
                  setHistoryOffset(next.offset);
                }}
              />
            </>
          )}
        </div>

        {!batchId ? (
          <div style={{ color: "var(--color-text-muted)" }}>Select a batch.</div>
        ) : loadingSession ? (
          <div style={{ color: "var(--color-text-muted)" }}>Loading session…</div>
        ) : !session ? (
          <button className="button" style={{ width: "auto" }} disabled={saving} onClick={() => void onCreateSession()}>
            {saving ? "Creating..." : "Create session"}
          </button>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Status: <strong>{session.status}</strong> • Version: {session.version}
                </div>
                {session.status !== "DRAFT" ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Published/Locked sessions may restrict edits.
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" style={{ width: "auto" }} disabled={!canEdit} onClick={() => setAll("PRESENT")}>
                  Mark all present
                </button>
                <button className="button secondary" style={{ width: "auto" }} disabled={!canEdit} onClick={() => setAll("ABSENT")}>
                  Mark all absent
                </button>
                <button className="button secondary" style={{ width: "auto" }} disabled={!canEdit} onClick={() => setAll("LATE")}>
                  Mark all late
                </button>
                <button className="button secondary" style={{ width: "auto" }} disabled={!canEdit} onClick={() => setAll("EXCUSED")}>
                  Mark all excused
                </button>
                <button className="button secondary" style={{ width: "auto" }} disabled={!canEdit} onClick={() => setBulkNoteOpen(true)}>
                  Note all student
                </button>
                <button className="button" style={{ width: "auto" }} disabled={!canEdit || saving} onClick={() => void onSave()}>
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button className="button secondary" style={{ width: "auto" }} disabled={saving || session.status !== "DRAFT"} onClick={() => setPublishConfirmOpen(true)}>
                  Publish
                </button>
              </div>
            </div>

            <ConfirmDialog
              open={publishConfirmOpen}
              title="Publish Attendance"
              message="Publish this attendance session? This may restrict edits."
              confirmLabel="Publish"
              onConfirm={onPublish}
              onCancel={() => setPublishConfirmOpen(false)}
            />

            <InputDialog
              open={bulkNoteOpen}
              title="Note all student"
              message="Apply the same note to every student in this session. Leave it blank to clear all existing notes."
              inputLabel="Attendance note"
              inputPlaceholder="Enter a note for all students"
              defaultValue=""
              confirmLabel="Apply note"
              onConfirm={(value) => {
                setNoteForAll(value);
                setBulkNoteOpen(false);
              }}
              onCancel={() => setBulkNoteOpen(false)}
            />

            <div className="card" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                <label style={{ display: "grid", gap: 6, flex: "1 1 280px" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search student code or name</span>
                  <input
                    className="input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search student code or name"
                  />
                </label>

                <label style={{ display: "grid", gap: 6, width: 160 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Rows per page</span>
                  <select
                    className="select"
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value, 10) || 20)}
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </label>
              </div>

              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Showing {pagedEntries.length} of {filteredEntries.length} students
                {filteredEntries.length !== entries.length ? ` (filtered from ${entries.length})` : ""}
              </div>
            </div>

            <DataTable
              columns={[
                { key: "admissionNo", header: "Student Code", render: (r) => r.admissionNo || "" },
                { key: "fullName", header: "Student Name", render: (r) => r.fullName || "" },
                {
                  key: "previousAttendance",
                  header: "Previous Attendance",
                  wrap: true,
                  render: (r) => {
                    const previous = r.previousAttendance;
                    if (!previous?.status) {
                      return <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No previous record</span>;
                    }

                    return (
                      <div style={{ display: "grid", gap: 4 }}>
                        <div>{renderAttendanceBadge(previous.status)}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                          {previous.date ? new Date(previous.date).toLocaleDateString() : "—"}
                          {previous.batchName ? ` • ${previous.batchName}` : ""}
                        </div>
                        {previous.note ? (
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{previous.note}</div>
                        ) : null}
                      </div>
                    );
                  }
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => (
                    <select
                      className="select"
                      value={localStatuses[r.studentId]?.status || r.status}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = { ...localStatuses };
                        next[r.studentId] = { status: e.target.value, note: next[r.studentId]?.note || "" };
                        setLocalStatuses(next);
                      }}
                    >
                      {ENTRY_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )
                },
                {
                  key: "note",
                  header: "Note",
                  render: (r) => (
                    <input
                      className="input"
                      value={localStatuses[r.studentId]?.note ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const next = { ...localStatuses };
                        next[r.studentId] = { status: next[r.studentId]?.status || r.status, note: e.target.value };
                        setLocalStatuses(next);
                      }}
                      placeholder="Optional"
                    />
                  )
                },
                {
                  key: "history",
                  header: "History",
                  render: (r) => (
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/attendance`}>
                      View History
                    </Link>
                  )
                }
              ]}
              rows={pagedEntries}
              keyField="studentId"
            />

            <PaginationBar
              limit={limit}
              offset={offset}
              count={pagedEntries.length}
              total={filteredEntries.length}
              onChange={(next) => {
                setLimit(next.limit);
                setOffset(next.offset);
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export { TeacherAttendancePage };
