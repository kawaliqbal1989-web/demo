import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { listBatches } from "../../services/batchesService";
import { createEnrollment, exportEnrollmentsCsvUrl, listEnrollments, updateEnrollment } from "../../services/enrollmentsService";
import { listStudents } from "../../services/studentsService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function CenterEnrollmentsPage() {
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");

  const [batchId, setBatchId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rosterPage, setRosterPage] = useState(0);
  const [rosterTotal, setRosterTotal] = useState(0);
  const ROSTER_PAGE_SIZE = 100;

  const [studentId, setStudentId] = useState("");
  const [assignedTeacherUserId, setAssignedTeacherUserId] = useState("");
  const [creating, setCreating] = useState(false);

  const PAGE_SIZE = 100;
  const [studentPage, setStudentPage] = useState(0);
  const [studentTotal, setStudentTotal] = useState(0);

  const teacherOptions = useMemo(() => teachers.filter((t) => t?.role === "TEACHER"), [teachers]);

  const [enrolledIds, setEnrolledIds] = useState(new Set());

  const loadEnrolledIds = async (forBatchId) => {
    if (!forBatchId) { setEnrolledIds(new Set()); return; }
    const ids = new Set();
    let off = 0;
    const chunk = 200;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await listEnrollments({ limit: chunk, offset: off, batchId: forBatchId, status: "ACTIVE" });
      const items = res.data?.items || [];
      for (const e of items) ids.add(e?.student?.id || e?.studentId);
      if (items.length < chunk) break;
      off += chunk;
    }
    setEnrolledIds(ids);
  };

  const availableStudents = useMemo(() => students.filter((s) => !enrolledIds.has(s.id)), [students, enrolledIds]);

  const loadStudentOptions = async (query = "", page = 0) => {
    setStudentsLoading(true);
    setStudentsError("");
    try {
      const s = await listStudents({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        q: query,
        status: "ACTIVE"
      });
      const result = s.data || {};
      setStudents(result.items || result || []);
      setStudentTotal(result.total ?? 0);
      setStudentPage(page);
    } catch (err) {
      setStudentsError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setStudentsLoading(false);
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [b, t] = await Promise.all([
        listBatches({ limit: 200, offset: 0 }),
        listTeachers({ limit: 200, offset: 0 })
      ]);
      setBatches(b.data?.items || []);
      setTeachers(t.data || []);
      await loadStudentOptions("", 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load setup data.");
    } finally {
      setLoading(false);
    }
  };

  const loadEnrollments = async (nextBatchId, page = 0) => {
    const id = nextBatchId || batchId;
    if (!id) {
      setRows([]);
      setRosterTotal(0);
      setRosterPage(0);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await listEnrollments({ limit: ROSTER_PAGE_SIZE, offset: page * ROSTER_PAGE_SIZE, batchId: id, status: "ACTIVE" });
      setRows(data.data?.items || []);
      setRosterTotal(data.data?.total ?? 0);
      setRosterPage(page);
      await loadEnrolledIds(id);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load enrollments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  const onSelectBatch = async (id) => {
    setBatchId(id);
    setStudentId("");
    setAssignedTeacherUserId("");
    await loadEnrollments(id, 0);
  };

  const onSearchStudents = async () => {
    setStudentId("");
    await loadStudentOptions(studentQuery.trim(), 0);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!batchId || !studentId) {
      setError("batchId and studentId are required");
      return;
    }

    setCreating(true);
    setError("");
    try {
      await createEnrollment({
        batchId,
        studentId,
        assignedTeacherUserId: assignedTeacherUserId || undefined
      });
      setStudentId("");
      setAssignedTeacherUserId("");
      await loadEnrollments(batchId, rosterPage);
      await loadEnrolledIds(batchId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to enroll.");
    } finally {
      setCreating(false);
    }
  };

  const [unenrollTarget, setUnenrollTarget] = useState(null);

  const onUnenroll = async () => {
    const row = unenrollTarget;
    setUnenrollTarget(null);
    if (!row) return;

    try {
      await updateEnrollment(row.id, { status: "INACTIVE" });
      await loadEnrollments(batchId, rosterPage);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to unenroll");
    }
  };

  if (loading && !batches.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="Enrollments / Roster" subtitle="View roster by batch and enroll/unenroll students" />

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>
          Batch
          <select className="select" value={batchId} onChange={(e) => void onSelectBatch(e.target.value)}>
            <option value="">Select</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {batchId ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <a className="button secondary" href={exportEnrollmentsCsvUrl({ batchId })} target="_blank" rel="noreferrer">
              Export CSV
            </a>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => void loadEnrollments(batchId, rosterPage)}>
              Refresh
            </button>
          </div>
        ) : null}
      </div>

      {batchId ? (
        <form className="card" onSubmit={onCreate} style={{ display: "grid", gap: 10 }}>
          <h3 style={{ marginTop: 0 }}>Enroll Student</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ minWidth: 260, flex: "1 1 320px" }}>
              Search student
              <input
                className="input"
                placeholder="Admission no or name"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
              />
            </label>
            <button className="button secondary" type="button" style={{ width: "auto" }} disabled={studentsLoading} onClick={() => void onSearchStudents()}>
              {studentsLoading ? "Searching..." : "Search"}
            </button>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto" }}
              onClick={() => {
                setStudentQuery("");
                setStudentId("");
                void loadStudentOptions("", 0);
              }}
              disabled={studentsLoading}
            >
              Clear
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--color-text-muted)" }}>
            <span>Showing {students.length} of {studentTotal} students{studentQuery.trim() ? ` matching "${studentQuery.trim()}"` : ""}</span>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
              disabled={studentsLoading || studentPage === 0}
              onClick={() => void loadStudentOptions(studentQuery.trim(), studentPage - 1)}
            >
              ← Prev
            </button>
            <span>Page {studentPage + 1} of {Math.max(1, Math.ceil(studentTotal / PAGE_SIZE))}</span>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
              disabled={studentsLoading || (studentPage + 1) * PAGE_SIZE >= studentTotal}
              onClick={() => void loadStudentOptions(studentQuery.trim(), studentPage + 1)}
            >
              Next →
            </button>
          </div>
          {studentsError ? <div className="error">{studentsError}</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Student
              <select className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Select</option>
                {availableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.admissionNo} - {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Assigned teacher (optional)
              <select className="select" value={assignedTeacherUserId} onChange={(e) => setAssignedTeacherUserId(e.target.value)}>
                <option value="">None</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t?.teacherProfile?.fullName || t.username}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="button" disabled={creating} style={{ width: "auto" }}>
            {creating ? "Enrolling..." : "Enroll"}
          </button>
        </form>
      ) : (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          Select a batch to view the roster.
        </div>
      )}

      {batchId ? (
        <>
          <DataTable
            columns={[
              { key: "admissionNo", header: "Admission No", render: (r) => r?.student?.admissionNo || "" },
              { key: "name", header: "Student", render: (r) => `${r?.student?.firstName || ""} ${r?.student?.lastName || ""}`.trim() },
              { key: "teacher", header: "Assigned Teacher", render: (r) => r?.assignedTeacher?.username || "" },
              { key: "status", header: "Status", render: (r) => r?.status || "" },
              {
                key: "actions",
                header: "Actions",
                render: (r) => (
                  <button className="button secondary" style={{ width: "auto" }} onClick={() => setUnenrollTarget(r)}>
                    Unenroll
                  </button>
                )
              }
            ]}
            rows={rows}
            keyField="id"
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: "var(--color-text-muted)", marginTop: 6 }}>
            <span>Showing {rows.length} of {rosterTotal} enrolled students</span>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
              disabled={loading || rosterPage === 0}
              onClick={() => void loadEnrollments(batchId, rosterPage - 1)}
            >
              ← Prev
            </button>
            <span>Page {rosterPage + 1} of {Math.max(1, Math.ceil(rosterTotal / ROSTER_PAGE_SIZE))}</span>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
              disabled={loading || (rosterPage + 1) * ROSTER_PAGE_SIZE >= rosterTotal}
              onClick={() => void loadEnrollments(batchId, rosterPage + 1)}
            >
              Next →
            </button>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={!!unenrollTarget}
        title="Unenroll Student"
        message={`Unenroll ${unenrollTarget?.student?.admissionNo || "student"} from this batch?`}
        confirmLabel="Unenroll"
        onConfirm={onUnenroll}
        onCancel={() => setUnenrollTarget(null)}
      />
    </section>
  );
}

export { CenterEnrollmentsPage };
