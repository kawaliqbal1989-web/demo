import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listLateEnrollmentRequests } from "../../services/examCyclesService";

function FranchiseExamLateEnrollmentPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listLateEnrollmentRequests(examCycleId, { status: "ALL" });
      setRequests(res?.data?.requests || []);
      setCounts(res?.data?.counts || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load late enrollment requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  if (loading) {
    return <LoadingState label="Loading late enrollment requests..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Franchise Late Enrollment</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Read-only visibility</div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>Back</button>
      </div>

      {counts ? (
        <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>Normal: <b>{counts.normalEnrollmentCount}</b></div>
          <div>Late: <b>{counts.lateEnrollmentCount}</b></div>
          <div>Total: <b>{counts.totalEnrollmentCount}</b></div>
        </div>
      ) : null}

      {error ? <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div> : null}

      <div className="card">
        <DataTable
          keyField="id"
          rows={requests}
          columns={[
            { key: "id", header: "Request", render: (row) => row.id.slice(0, 10) },
            { key: "center", header: "Center", render: (row) => row?.centerNode?.name || "" },
            { key: "status", header: "Status" },
            { key: "submittedBy", header: "Submitted By", render: (row) => row?.submittedBy?.username || "" },
            { key: "submittedAt", header: "Submitted", render: (row) => new Date(row.submittedAt).toLocaleString() },
            { key: "students", header: "Students", render: (row) => row.students?.length || 0 }
          ]}
        />
      </div>
    </section>
  );
}

export { FranchiseExamLateEnrollmentPage };
