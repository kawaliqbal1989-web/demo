import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchableDropdown } from "../../components/SearchableDropdown";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listBatches } from "../../services/batchesService";
import { createAttendanceSession, listAttendanceCorrections, listAttendanceSessions, reviewAttendanceCorrection } from "../../services/attendanceService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchesTeacherBatch(batch, teacherUserId) {
  if (!teacherUserId || !batch) return false;
  if (String(batch.primaryTeacherUserId || "") === String(teacherUserId)) {
    return true;
  }
  return (batch.teacherAssignments || []).some((assignment) => {
    const assignmentTeacherId = assignment?.teacher?.id || assignment?.teacherUserId || "";
    return String(assignmentTeacherId) === String(teacherUserId);
  });
}

function CenterAttendanceSessionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState(() => String(searchParams.get("teacherUserId") || ""));
  const [batchId, setBatchId] = useState(() => String(searchParams.get("batchId") || ""));
  const [date, setDate] = useState(todayISO());

  const [rows, setRows] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const teacherOptions = useMemo(
    () => teachers.filter((t) => t?.role === "TEACHER" && t?.isActive !== false),
    [teachers]
  );
  const teacherDropdownOptions = useMemo(
    () => teacherOptions.map((teacher) => ({
      value: teacher.id,
      label: teacher?.teacherProfile?.fullName || teacher.username || teacher.email || "Teacher"
    })),
    [teacherOptions]
  );
  const batchOptions = useMemo(() => {
    if (!selectedTeacherUserId) return batches;
    return batches.filter((batch) => matchesTeacherBatch(batch, selectedTeacherUserId));
  }, [batches, selectedTeacherUserId]);
  const batchDropdownOptions = useMemo(
    () => batchOptions.map((batch) => ({ value: batch.id, label: batch.name })),
    [batchOptions]
  );

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [b, t, c] = await Promise.all([
        listBatches({ limit: 200, offset: 0 }),
        listTeachers({ limit: 500, offset: 0, status: "ACTIVE" }),
        listAttendanceCorrections({ limit: 50, offset: 0, status: "PENDING" })
      ]);
      setBatches(b.data?.items || []);
      setTeachers(t.data || []);
      setCorrections(c.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load attendance setup.");
    } finally {
      setLoading(false);
    }
  };

  const refreshCorrections = async () => {
    try {
      const c = await listAttendanceCorrections({ limit: 50, offset: 0, status: "PENDING" });
      setCorrections(c.data?.items || []);
    } catch {
      // ignore
    }
  };

  const loadSessions = async ({ nextBatchId = batchId, nextTeacherUserId = selectedTeacherUserId } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listAttendanceSessions({
        limit: 100,
        offset: 0,
        batchId: nextBatchId,
        teacherUserId: nextTeacherUserId
      });
      setRows(data.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const teacherAllowedIds = new Set(teacherOptions.map((teacher) => String(teacher.id)));
    if (selectedTeacherUserId && !teacherAllowedIds.has(String(selectedTeacherUserId))) {
      setSelectedTeacherUserId("");
    }
  }, [selectedTeacherUserId, teacherOptions]);

  useEffect(() => {
    if (!selectedTeacherUserId) return;
    if (batchId && !batchOptions.some((batch) => batch.id === batchId)) {
      setBatchId("");
    }
  }, [selectedTeacherUserId, batchId, batchOptions]);

  useEffect(() => {
    const params = {};
    if (selectedTeacherUserId) params.teacherUserId = selectedTeacherUserId;
    if (batchId) params.batchId = batchId;
    setSearchParams(params, { replace: true });
  }, [selectedTeacherUserId, batchId, setSearchParams]);

  useEffect(() => {
    if (!batches.length) return;
    void loadSessions({ nextBatchId: batchId, nextTeacherUserId: selectedTeacherUserId });
  }, [batches.length, batchId, selectedTeacherUserId]);

  const onSelectTeacher = (teacherUserId) => {
    setSelectedTeacherUserId(teacherUserId || "");
  };

  const onSelectBatch = (id) => {
    setBatchId(id || "");
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!batchId || !date) {
      setError("batchId and date are required");
      return;
    }

    setCreating(true);
    setError("");
    try {
      await createAttendanceSession({ batchId, date });
      await loadSessions({ nextBatchId: batchId, nextTeacherUserId: selectedTeacherUserId });
      await refreshCorrections();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create session.");
    } finally {
      setCreating(false);
    }
  };

  const onReviewCorrection = async (requestId, action) => {
    setReviewing(true);
    setError("");
    try {
      await reviewAttendanceCorrection(requestId, action);
      await refreshCorrections();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to review correction.");
    } finally {
      setReviewing(false);
    }
  };

  if (loading && !batches.length) {
    return <LoadingState label="Loading attendance..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Attendance Sessions</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create and manage roll-call sessions by batch and date</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <label>
            Teacher
            <SearchableDropdown
              options={teacherDropdownOptions}
              value={selectedTeacherUserId}
              onChange={onSelectTeacher}
              placeholder="All teachers"
            />
          </label>

          <label>
            Batch
            <SearchableDropdown
              options={batchDropdownOptions}
              value={batchId}
              onChange={onSelectBatch}
              placeholder={selectedTeacherUserId ? "Teacher batches" : "All batches"}
            />
          </label>
        </div>

        {selectedTeacherUserId ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Batch list is filtered to the selected teacher's assignments.
          </div>
        ) : null}

        <form onSubmit={onCreate} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Date</span>
            <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </label>

          <button className="button" style={{ width: "auto" }} disabled={!batchId || creating}>
            {creating ? "Creating..." : "Create Session"}
          </button>

          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => void loadSessions({ nextBatchId: batchId, nextTeacherUserId: selectedTeacherUserId })}
          >
            Refresh
          </button>
        </form>
      </div>

      <DataTable
        columns={[
          { key: "date", header: "Date", render: (r) => String(r?.date || "").slice(0, 10) },
          { key: "batch", header: "Batch", render: (r) => r?.batch?.name || "" },
          { key: "status", header: "Status" },
          { key: "version", header: "Version" },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <Link className="button secondary" style={{ width: "auto" }} to={`/attendance/sessions/${r.id}`}>
                Open
              </Link>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Pending Corrections</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Approve or reject attendance correction requests</div>
          </div>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void refreshCorrections()} disabled={reviewing}>
            Refresh
          </button>
        </div>

        <DataTable
          columns={[
            { key: "date", header: "Date", render: (r) => String(r?.session?.date || "").slice(0, 10) },
            { key: "batch", header: "Batch", render: (r) => r?.session?.batch?.name || "" },
            { key: "requestedBy", header: "Requested By", render: (r) => r?.requestedBy?.username || r?.requestedBy?.email || "" },
            { key: "reason", header: "Reason", render: (r) => r?.reason || "" },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="button secondary" style={{ width: "auto" }} disabled={reviewing} onClick={() => void onReviewCorrection(r.id, "APPROVE")}>
                    Approve
                  </button>
                  <button className="button secondary" style={{ width: "auto" }} disabled={reviewing} onClick={() => void onReviewCorrection(r.id, "REJECT")}>
                    Reject
                  </button>
                </div>
              )
            }
          ]}
          rows={corrections}
          keyField="id"
        />
      </div>
    </section>
  );
}

export { CenterAttendanceSessionsPage };
