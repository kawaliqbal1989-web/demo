import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listLateEnrollmentRequests } from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function ExamLateEnrollmentReadOnlyPage({ title = "Late Enrollment", subtitle = "Read-only late enrollment visibility." }) {
  const { examCycleId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = async (status = statusFilter) => {
    setLoading(true);
    setError("");
    try {
      const res = await listLateEnrollmentRequests(examCycleId, { status });
      setRequests(res?.data?.requests || []);
      setCounts(res?.data?.counts || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load late enrollment requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((row) => {
      const status = String(row?.status || "").toUpperCase();
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!q) return true;
      return [
        row?.id,
        row?.centerNode?.name,
        row?.centerNode?.code,
        row?.submittedBy?.username,
        status
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [requests, search, statusFilter]);

  const requestSummary = useMemo(() => {
    return requests.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.students += Number(row?.students?.length || 0);
        const status = String(row?.status || "UNKNOWN").toUpperCase();
        acc.statuses[status] = (acc.statuses[status] || 0) + 1;
        return acc;
      },
      { total: 0, students: 0, statuses: {} }
    );
  }, [requests]);

  if (loading) {
    return <LoadingState label="Loading late enrollment requests..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" type="button" onClick={() => void load(statusFilter)} style={{ width: "auto" }}>
            Refresh
          </button>
          <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
            Back
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          ["Normal Enrollment", counts?.normalEnrollmentCount ?? 0],
          ["Late Enrollment", counts?.lateEnrollmentCount ?? 0],
          ["Total Enrollment", counts?.totalEnrollmentCount ?? 0],
          ["Requests", requestSummary.total],
          ["Students Requested", requestSummary.students]
        ].map(([label, value]) => (
          <div key={label} className="card" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{Number(value || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Search
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Center, submitter, status" />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Status
            <select
              className="input"
              value={statusFilter}
              onChange={(event) => {
                const next = event.target.value;
                setStatusFilter(next);
                void load(next);
              }}
            >
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="PARTIALLY_APPROVED">Partially approved</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setSearch("");
              setStatusFilter("ALL");
              void load("ALL");
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Showing {visibleRows.length} of {requests.length} requests.</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card">
        <DataTable
          keyField="id"
          rows={visibleRows}
          emptyMessage={error ? "Unable to load late enrollment requests." : "No late enrollment requests match the selected filters."}
          columns={[
            { key: "id", header: "Request", render: (row) => String(row.id || "").slice(0, 10) },
            { key: "center", header: "Center", render: (row) => row?.centerNode?.name || "-" },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status || "SUBMITTED"} /> },
            { key: "submittedBy", header: "Submitted By", render: (row) => row?.submittedBy?.username || "-" },
            { key: "submittedAt", header: "Submitted", render: (row) => formatDateTime(row.submittedAt) },
            { key: "students", header: "Students", render: (row) => row.students?.length || 0 }
          ]}
        />
      </div>
    </section>
  );
}

export { ExamLateEnrollmentReadOnlyPage };
