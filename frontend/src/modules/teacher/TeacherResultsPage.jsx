import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listMyStudents } from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatCourseLevel(row) {
  const courseCode = row?.course?.code || "-";
  const levelRank = row?.level?.rank || row?.level?.name || "-";
  return `${courseCode} / ${levelRank}`;
}

function TeacherResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const load = async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await listMyStudents({ q: query });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load student results.");
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
    return <LoadingState label="Loading student results..." />;
  }

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Student Results</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            View result-related data for students assigned to you.
          </div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/students">
          Open Assigned Students
        </Link>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search student code or name</div>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student code or name"
        />
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
          { key: "latestAttempt", header: "Latest Attempt", render: (r) => formatDateTime(r.latestAttemptAt) },
          {
            key: "actions",
            header: "Result Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(r.studentId)}`}>
                  Overview
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(r.studentId)}/attempts`}>
                  Attempts
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(r.studentId)}/practice-report`}>
                  Practice Report
                </Link>
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
    </section>
  );
}

export { TeacherResultsPage };
