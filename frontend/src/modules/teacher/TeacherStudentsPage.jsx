import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listMyStudents, overrideTeacherStudentPromotion } from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatCourseLevel(row) {
  const courseCode = row?.course?.code || "—";
  const levelRank = row?.level?.rank || row?.level?.name || "—";
  return `${courseCode} / ${levelRank}`;
}

function renderFeatureStatus(enabled, label) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: enabled ? "var(--color-bg-success-light)" : "var(--color-bg-muted)",
        color: enabled ? "var(--color-text-success)" : "var(--color-text-muted)"
      }}
    >
      {enabled ? `${label} assigned` : `${label} not assigned`}
    </span>
  );
}

function TeacherStudentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [overrideTarget, setOverrideTarget] = useState(null);

  const load = async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await listMyStudents({ q: query });
      setRows(data.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    const timeout = setTimeout(() => {
      void load(search);
    }, 250);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (loading) {
    return <LoadingState label="Loading students..." />;
  }

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  const onOverridePromotion = async (value) => {
    const row = overrideTarget;
    setOverrideTarget(null);
    if (!row) return;

    const parsed = Number(String(value || "").trim());
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      setError("Level rank must be a positive number.");
      return;
    }

    try {
      await overrideTeacherStudentPromotion(row.studentId, { levelRank: parsed });
      await load(search);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to override promotion.");
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Assigned Students</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Students assigned to you through active enrollments.</div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/results">
          Open Results
        </Link>
      </div>

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
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10) || 20);
                setOffset(0);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </label>
        </div>

        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Showing {pageRows.length} of {total} students
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "admissionNo", header: "Student Code", render: (r) => r.admissionNo || "" },
          { key: "name", header: "Name", render: (r) => r.fullName || "" },
          { key: "courseLevel", header: "Course/Level", render: (r) => formatCourseLevel(r) },
          {
            key: "practiceFeature",
            header: "Practice",
            render: (r) => renderFeatureStatus(Boolean(r.hasPractice), "Practice")
          },
          {
            key: "abacusPracticeFeature",
            header: "Abacus Practice",
            render: (r) => renderFeatureStatus(Boolean(r.hasAbacusPractice), "Abacus")
          },
          { key: "status", header: "Status", render: (r) => r.status || "" },
          { key: "assigned", header: "Assigned", render: (r) => Number(r.assignedWorksheetCount || 0) },
          { key: "latestAttempt", header: "Latest Attempt", render: (r) => formatDateTime(r.latestAttemptAt) },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Link className="button" style={{ width: "auto", background: "#7c3aed" }} to={`/teacher/students/${r.studentId}/360`}>
                  360°
                </Link>
                <details>
                  <summary style={{ cursor: "pointer" }}>Actions</summary>
                  <div style={{ display: "grid", gap: 6, paddingTop: 8 }}>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/notes?studentId=${encodeURIComponent(r.studentId)}`}>
                      Notes
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/materials`}>
                      Materials
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/assign-worksheets`}>
                      Assign Worksheets
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/attempts`}>
                      Attempts
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/practice-report`}>
                      Practice Report
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/attendance`}>
                      Attendance
                    </Link>
                    <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setOverrideTarget(r)}>
                      Override Promotion
                    </button>
                  </div>
                </details>
              </div>
            )
          }
        ]}
        rows={pageRows}
        keyField="studentId"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={pageRows.length}
        total={total}
        onChange={(next) => {
          setOffset(next.offset);
        }}
      />

      <InputDialog
        open={!!overrideTarget}
        title="Override Promotion"
        message="Enter the target level rank number."
        inputLabel="Level Rank"
        defaultValue={overrideTarget?.level?.rank != null ? String(overrideTarget.level.rank) : "1"}
        confirmLabel="Apply"
        onConfirm={onOverridePromotion}
        onCancel={() => setOverrideTarget(null)}
      />
    </section>
  );
}

export { TeacherStudentsPage };
