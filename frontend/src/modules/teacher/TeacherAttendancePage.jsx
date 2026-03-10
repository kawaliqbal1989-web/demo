import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getApiErrorCode, getFriendlyErrorMessage } from "../../utils/apiErrors";
import { ATTENDANCE_STATUS_COLORS } from "../../utils/attendance";
import {
  createAttendanceSession,
  getAttendanceSession,
  listAttendanceSessions,
  listMyBatches,
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

  const [session, setSession] = useState(null);
  const [localStatuses, setLocalStatuses] = useState({});

  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

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
