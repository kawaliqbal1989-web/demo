import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getTeacherStudentMaterials } from "../../services/teacherPortalService";

function TeacherStudentMaterialsPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [student, setStudent] = useState(null);
  const [worksheets, setWorksheets] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getTeacherStudentMaterials(studentId)
      .then((res) => {
        if (cancelled) return;
        setStudent(res?.data?.student || null);
        setWorksheets(Array.isArray(res?.data?.worksheets) ? res.data.worksheets : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load materials.");
        setWorksheets([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return <LoadingState label="Loading materials..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Learning Materials</h2>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Student</div>
        <div>{student ? `${student.fullName} (${student.admissionNo})` : "—"}</div>

        <div style={{ fontWeight: 600 }}>Course / Level</div>
        <div>{student?.courseLevelLabel || "—"}</div>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Worksheets</h3>
      </div>

      <DataTable
        columns={[
          { key: "number", header: "#", render: (row) => row.number },
          { key: "title", header: "Title", render: (row) => row.title || "" },
          { key: "status", header: "Status", render: (row) => row.status || "" },
          { key: "actions", header: "Actions", render: () => "-" }
        ]}
        rows={worksheets.map((worksheet, index) => ({ ...worksheet, number: index + 1 }))}
        keyField="id"
      />

      {!worksheets.length ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          No worksheets available.
        </div>
      ) : null}

      <div>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/students">
          Close
        </Link>
      </div>
    </section>
  );
}

export { TeacherStudentMaterialsPage };
