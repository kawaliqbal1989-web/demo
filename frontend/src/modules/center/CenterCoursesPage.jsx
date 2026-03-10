import { useEffect, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listCenterAvailableCourses } from "../../services/centerService";

function CenterCoursesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await listCenterAvailableCourses();
      setRows(resp?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load courses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading courses..." />;
  }

  const columns = [
    { key: "code", header: "Code", render: (r) => r.code },
    { key: "name", header: "Name", render: (r) => r.name },
    { key: "description", header: "Description", render: (r) => r.description || "—" },
    { key: "active", header: "Active", render: (r) => (r.isActive ? "Yes" : "No") }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="list-page-header">
        <h2 style={{ margin: 0 }}>My Courses</h2>
        <button className="button secondary" type="button" onClick={load} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card">
        <DataTable columns={columns} rows={rows} keyField="id" />
        {!rows.length ? <div style={{ color: "var(--color-text-muted)", marginTop: 10 }}>No courses available for your center.</div> : null}
      </div>
    </section>
  );
}

export { CenterCoursesPage };
