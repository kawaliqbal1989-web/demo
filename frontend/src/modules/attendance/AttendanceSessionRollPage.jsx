import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { LoadingState } from "../../components/LoadingState";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  getAttendanceSession,
  listAttendanceSessions,
  lockAttendanceSession,
  publishAttendanceSession,
  requestAttendanceCorrection,
  updateAttendanceEntries,
  cancelAttendanceSession,
  reopenAttendanceSession
} from "../../services/attendanceService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const LOCAL_QUEUE_KEY = "abacus_attendance_queue_v1";

function hasAttendanceChanges(entries, localStatuses) {
  return entries.some((entry) => {
    const local = localStatuses[entry.studentId];
    if (!local) return false;
    return (local.status || entry.status) !== entry.status || (local.note || "") !== (entry.note || "");
  });
}

function loadQueue() {
  try {
    const raw = localStorage.getItem(LOCAL_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  try {
    localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

function getEntryAdmissionNo(entry) {
  return entry?.admissionNo || entry?.student?.admissionNo || "";
}

function getEntryFullName(entry) {
  if (entry?.fullName) {
    return entry.fullName;
  }

  const firstName = String(entry?.student?.firstName || "").trim();
  const lastName = String(entry?.student?.lastName || "").trim();
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function toIsoDateOnly(value) {
  if (!value) return "";
  const asDate = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString().slice(0, 10);
  }

  const asString = String(value);
  return asString.length >= 10 ? asString.slice(0, 10) : "";
}

function AttendanceSessionRollPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { role } = useAuth();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [localStatuses, setLocalStatuses] = useState({});
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [previousSession, setPreviousSession] = useState(null);
  const [nextSession, setNextSession] = useState(null);
  const [loadingNeighbors, setLoadingNeighbors] = useState(false);
  const [resolvingDateNavigation, setResolvingDateNavigation] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [navigationConfirmOpen, setNavigationConfirmOpen] = useState(false);

  const [queue, setQueue] = useState(() => loadQueue());

  const entries = useMemo(() => session?.entries || [], [session]);
  const currentSessionDate = useMemo(() => toIsoDateOnly(session?.date), [session?.date]);
  const hasUnsavedChanges = useMemo(() => hasAttendanceChanges(entries, localStatuses), [entries, localStatuses]);
  const navigationBusy = loading || saving || loadingNeighbors || resolvingDateNavigation;
  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const currentStatus = localStatuses[entry.studentId]?.status || entry.status;
      if (statusFilter && currentStatus !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const admissionNo = String(getEntryAdmissionNo(entry)).toLowerCase();
      const fullName = String(getEntryFullName(entry)).toLowerCase();
      return admissionNo.includes(query) || fullName.includes(query);
    });
  }, [entries, localStatuses, search, statusFilter]);
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
    setStatusFilter("");
    setOffset(0);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const data = await getAttendanceSession(id);
      setSession(data.data);
      hydrateLocal(data.data);
    } catch (err) {
      setSession(null);
      setError(getFriendlyErrorMessage(err) || "Failed to load session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    setOffset(0);
  }, [search, statusFilter, limit]);

  useEffect(() => {
    if (offset >= filteredEntries.length && filteredEntries.length > 0) {
      setOffset(Math.max(0, Math.floor((filteredEntries.length - 1) / limit) * limit));
    }
  }, [filteredEntries.length, limit, offset]);

  useEffect(() => {
    setSelectedDate(currentSessionDate);
  }, [currentSessionDate, session?.id]);

  useEffect(() => {
    if (!session?.id || !session?.batchId || !currentSessionDate) {
      setPreviousSession(null);
      setNextSession(null);
      return;
    }

    let active = true;

    const loadNeighborSessions = async () => {
      setLoadingNeighbors(true);
      try {
        const response = await listAttendanceSessions({ limit: 500, offset: 0, batchId: session.batchId });
        const items = Array.isArray(response?.data?.items) ? response.data.items : [];

        let previous = null;
        let next = null;

        for (const item of items) {
          if (!item?.id || item.id === session.id) continue;

          const itemDate = toIsoDateOnly(item.date);
          if (!itemDate) continue;

          if (itemDate < currentSessionDate && (!previous || itemDate > toIsoDateOnly(previous.date))) {
            previous = item;
          }

          if (itemDate > currentSessionDate && (!next || itemDate < toIsoDateOnly(next.date))) {
            next = item;
          }
        }

        if (!active) return;

        setPreviousSession(previous);
        setNextSession(next);
      } catch {
        if (!active) return;
        setPreviousSession(null);
        setNextSession(null);
      } finally {
        if (active) {
          setLoadingNeighbors(false);
        }
      }
    };

    void loadNeighborSessions();

    return () => {
      active = false;
    };
  }, [currentSessionDate, session?.batchId, session?.id]);

  const enqueueIfOffline = (payload) => {
    const next = [...queue, payload];
    setQueue(next);
    saveQueue(next);
  };

  const trySyncQueue = async () => {
    if (!queue.length) return;

    const remaining = [];
    for (const item of queue) {
      try {
        // only sync items for this session id
        if (item.sessionId !== id) {
          remaining.push(item);
          continue;
        }
        await updateAttendanceEntries(id, item.payload);
      } catch {
        remaining.push(item);
      }
    }

    setQueue(remaining);
    saveQueue(remaining);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      void trySyncQueue();
    }, 5000);
    return () => clearInterval(timer);
  }, [queue, id]);

  const setAll = (status) => {
    const next = { ...localStatuses };
    for (const e of entries) {
      next[e.studentId] = { status, note: next[e.studentId]?.note || "" };
    }
    setLocalStatuses(next);
  };

  const canEditEntries = session?.status === "DRAFT" || session?.status === "PUBLISHED";
  const canPublish = session?.status === "DRAFT";
  const canLock = role !== "TEACHER" && session?.status === "PUBLISHED";
  const canCancel = role !== "TEACHER" && session?.status !== "CANCELLED";
  const canReopen = session?.status === "LOCKED" || session?.status === "CANCELLED";

  const closeNavigationConfirm = () => {
    setNavigationConfirmOpen(false);
    setPendingNavigation(null);
  };

  const performNavigation = (target) => {
    if (!target?.id || target.id === id) return;
    setNavigationConfirmOpen(false);
    setPendingNavigation(null);
    setError("");
    setInfo("");
    navigate(`/attendance/sessions/${target.id}`);
  };

  const requestNavigation = (target) => {
    if (!target?.id || loading || saving || loadingNeighbors) return;
    if (target.id === id) {
      setInfo("This attendance session is already open.");
      return;
    }

    if (hasUnsavedChanges) {
      setPendingNavigation(target);
      setNavigationConfirmOpen(true);
      return;
    }

    performNavigation(target);
  };

  const onOpenSelectedDate = async () => {
    if (!session?.batchId) return;

    const nextDate = toIsoDateOnly(selectedDate);
    if (!nextDate) {
      setError("Select a valid attendance date.");
      return;
    }

    if (nextDate === currentSessionDate) {
      setInfo("This attendance session is already open.");
      return;
    }

    setResolvingDateNavigation(true);
    setError("");
    setInfo("");

    try {
      const response = await listAttendanceSessions({ limit: 10, offset: 0, batchId: session.batchId, from: nextDate, to: nextDate });
      const items = Array.isArray(response?.data?.items) ? response.data.items : [];
      const target = items.find((item) => toIsoDateOnly(item?.date) === nextDate);

      if (!target?.id) {
        setError(`No attendance session found for ${nextDate}.`);
        return;
      }

      requestNavigation({ id: target.id, date: nextDate });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to open attendance date.");
    } finally {
      setResolvingDateNavigation(false);
    }
  };

  const onSaveDraft = async () => {
    if (!session || !canEditEntries) return;

    setSaving(true);
    setError("");
    setInfo("");

    const payload = {
      version: session.version,
      reason: reason || undefined,
      entries: Object.entries(localStatuses).map(([studentId, v]) => ({
        studentId,
        status: v.status,
        note: v.note || undefined
      }))
    };

    try {
      const res = await updateAttendanceEntries(id, payload);
      const newVersion = res.data?.version;
      setInfo(`Saved. Version ${newVersion}`);
      await load();
    } catch (err) {
      const msg = getFriendlyErrorMessage(err) || "Save failed";
      setError(msg);

      // offline mode: if no response (network/CORS), queue it
      const hasResponse = Boolean(err?.response);
      if (!hasResponse) {
        enqueueIfOffline({ sessionId: id, payload });
        setInfo("Offline: changes queued and will sync automatically.");
      }
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentDraft = async () => {
    if (!session || !canEditEntries) return session;

    const payload = {
      version: session.version,
      reason: reason || undefined,
      entries: Object.entries(localStatuses).map(([studentId, v]) => ({
        studentId,
        status: v.status,
        note: v.note || undefined
      }))
    };

    const res = await updateAttendanceEntries(id, payload);
    const newVersion = res.data?.version;
    setInfo(`Saved. Version ${newVersion}`);
    await load();
    return session;
  };

  const onPublish = async () => {
    if (!canPublish) return;

    setSaving(true);
    setError("");
    setInfo("");
    try {
      if (hasAttendanceChanges(entries, localStatuses)) {
        await saveCurrentDraft();
      }
      await publishAttendanceSession(id);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  const onLock = async () => {
    if (!canLock) return;

    setSaving(true);
    setError("");
    setInfo("");
    try {
      if (hasAttendanceChanges(entries, localStatuses)) {
        await saveCurrentDraft();
      }
      await lockAttendanceSession(id);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Lock failed");
    } finally {
      setSaving(false);
    }
  };

  const onRequestCorrection = async () => {
    if (!reason.trim()) {
      setError("Reason is required for correction request");
      return;
    }

    setSaving(true);
    setError("");
    setInfo("");

    const payload = {
      reason,
      entries: Object.entries(localStatuses).map(([studentId, v]) => ({
        studentId,
        status: v.status,
        note: v.note || undefined
      }))
    };

    try {
      await requestAttendanceCorrection(id, payload);
      setInfo("Correction requested.");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Correction request failed");
    } finally {
      setSaving(false);
    }
  };

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const onCancel = async () => {
    if (!canCancel) {
      setCancelConfirmOpen(false);
      return;
    }

    setCancelConfirmOpen(false);
    setSaving(true);
    setError("");
    setInfo("");
    try {
      await cancelAttendanceSession(id);
      setInfo("Session cancelled.");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Cancel failed");
    } finally {
      setSaving(false);
    }
  };

  const onReopen = async () => {
    if (!canReopen) return;

    if (!reason.trim()) {
      setError("Reason is required to reopen this session");
      return;
    }

    setSaving(true);
    setError("");
    setInfo("");
    try {
      await reopenAttendanceSession(id, { reason: reason.trim() });
      setInfo("Session reopened.");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Reopen failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading attendance session..." />;
  }

  if (!session) {
    return (
      <div className="card">
        <p className="error">{error || "Session not found"}</p>
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>Roll / Attendance</h2>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Batch: {session?.batch?.name || ""} • Date: {currentSessionDate} • Status: {session.status} • Version: {session.version}
            </div>
            {!canEditEntries ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                This session is read-only in its current state.
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button secondary" style={{ width: "auto" }} disabled={!canEditEntries} onClick={() => setAll("PRESENT")}>Mark all present</button>
            <button className="button secondary" style={{ width: "auto" }} disabled={!canEditEntries} onClick={() => setAll("ABSENT")}>Mark all absent</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            disabled={!previousSession || navigationBusy}
            onClick={() => requestNavigation({ id: previousSession.id, date: toIsoDateOnly(previousSession.date) })}
          >
            Back date
          </button>

          <label style={{ display: "grid", gap: 4, minWidth: 180 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Open attendance date</span>
            <input
              className="input"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>

          <button
            className="button secondary"
            style={{ width: "auto" }}
            disabled={!selectedDate || navigationBusy}
            onClick={() => void onOpenSelectedDate()}
          >
            {resolvingDateNavigation ? "Opening..." : "Open"}
          </button>

          <button
            className="button secondary"
            style={{ width: "auto" }}
            disabled={!nextSession || navigationBusy}
            onClick={() => requestNavigation({ id: nextSession.id, date: toIsoDateOnly(nextSession.date) })}
          >
            Next date
          </button>
        </div>

        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {loadingNeighbors
            ? "Loading nearby attendance dates..."
            : `Previous: ${toIsoDateOnly(previousSession?.date) || "—"} • Next: ${toIsoDateOnly(nextSession?.date) || "—"}`}
        </div>

        {queue.some((q) => q.sessionId === id) ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Offline queue: {queue.filter((q) => q.sessionId === id).length} pending sync</div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {info ? <p style={{ color: "var(--color-text-success)", fontWeight: 700 }}>{info}</p> : null}

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Reason (required for corrections and reopen, optional for save)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Late bus / entry correction" />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" style={{ width: "auto" }} disabled={saving || !canEditEntries} onClick={onSaveDraft}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="button secondary" style={{ width: "auto" }} disabled={saving || !canPublish} onClick={onPublish}>
            Publish
          </button>
          <button className="button secondary" style={{ width: "auto" }} disabled={saving || !canLock} onClick={onLock}>
            Lock
          </button>
          <button className="button secondary" style={{ width: "auto" }} disabled={saving} onClick={onRequestCorrection}>
            Request correction
          </button>
          {canCancel && (
            <button className="button secondary" style={{ width: "auto", color: "#dc2626" }} disabled={saving} onClick={() => setCancelConfirmOpen(true)}>
              Cancel Session
            </button>
          )}
          {canReopen && (
            <button className="button secondary" style={{ width: "auto", color: "#2563eb" }} disabled={saving} onClick={onReopen}>
              Reopen Session
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel Session"
        message="Are you sure you want to cancel this attendance session?"
        confirmLabel="Cancel Session"
        onConfirm={onCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />

      <ConfirmDialog
        open={navigationConfirmOpen}
        title="Discard unsaved changes?"
        message={`You have unsaved attendance changes. Continue to ${pendingNavigation?.date || "the selected date"} without saving?`}
        confirmLabel="Discard and continue"
        onConfirm={() => performNavigation(pendingNavigation)}
        onCancel={closeNavigationConfirm}
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

          <label style={{ display: "grid", gap: 6, width: 180 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status filter</span>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LATE">Late</option>
              <option value="EXCUSED">Excused</option>
            </select>
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
          { key: "admissionNo", header: "Admission No", render: (r) => getEntryAdmissionNo(r) },
          { key: "student", header: "Student", render: (r) => getEntryFullName(r) },
          {
            key: "status",
            header: "Status",
            render: (r) => (
              <select
                className="select"
                value={localStatuses[r.studentId]?.status || r.status}
                disabled={!canEditEntries}
                onChange={(ev) => {
                  const next = { ...localStatuses };
                  next[r.studentId] = { status: ev.target.value, note: next[r.studentId]?.note || "" };
                  setLocalStatuses(next);
                }}
                style={{ minWidth: 140 }}
              >
                <option value="PRESENT">PRESENT</option>
                <option value="ABSENT">ABSENT</option>
                <option value="LATE">LATE</option>
                <option value="EXCUSED">EXCUSED</option>
              </select>
            )
          },
          {
            key: "note",
            header: "Note",
            render: (r) => (
              <input
                className="input"
                value={localStatuses[r.studentId]?.note || ""}
                disabled={!canEditEntries}
                onChange={(ev) => {
                  const next = { ...localStatuses };
                  next[r.studentId] = { status: next[r.studentId]?.status || r.status, note: ev.target.value };
                  setLocalStatuses(next);
                }}
                placeholder="Optional"
                style={{ minWidth: 240 }}
              />
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
    </section>
  );
}

export { AttendanceSessionRollPage };
