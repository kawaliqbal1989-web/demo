import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getExamResultsControlCenter } from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function SuperadminExamResultsControlCenterPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async ({ nextLimit = limit, nextOffset = offset, nextStatus = status, nextQuery = q } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await getExamResultsControlCenter({
        limit: nextLimit,
        offset: nextOffset,
        status: nextStatus,
        q: nextQuery
      });
      setRows(response?.data?.items || []);
      setTotal(response?.data?.total || 0);
      setLimit(response?.data?.limit || nextLimit);
      setOffset(response?.data?.offset || nextOffset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam result control center.");
    } finally {
      setLoading(false);
    }
  }, [limit, offset, q, status]);

  useEffect(() => {
    void load({ nextLimit: 20, nextOffset: 0, nextStatus: status, nextQuery: q });
  }, [load, q, status]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam result control center..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Result Control Center</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Review publication readiness, publish/unpublish states, and audit trail.
          </div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/superadmin/exam-cycles">
          Back To Exam Cycles
        </Link>
      </div>

      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={status}
          onChange={(event) => {
            setStatus(String(event.target.value || "ALL"));
            setOffset(0);
          }}
          style={{ width: 220 }}
        >
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="READY_FOR_REVIEW">Ready For Review</option>
          <option value="LOCKED">Locked</option>
          <option value="PUBLISHED">Published</option>
        </select>

        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search by exam code or name"
          style={{ minWidth: 260 }}
        />

        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => {
            setQ(String(input || "").trim());
            setOffset(0);
          }}
        >
          Search
        </button>

        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <DataTable
          rows={rows}
          emptyMessage={error ? "Unable to load records. Use Refresh to retry." : "No exam cycles match this filter."}
          keyField={(row) => row.id}
          columns={[
            { key: "code", header: "Exam", render: (row) => (
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 600 }}>{row.code}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.name}</div>
              </div>
            ) },
            { key: "partner", header: "Business Partner", render: (row) => row?.businessPartner?.name || "-" },
            { key: "status", header: "Publication Status", render: (row) => row.resultStatus },
            { key: "normalCount", header: "Normal", render: (row) => String(row?.enrollmentCounts?.normalEnrollmentCount ?? 0) },
            { key: "lateCount", header: "Late", render: (row) => String(row?.enrollmentCounts?.lateEnrollmentCount ?? 0) },
            { key: "totalCount", header: "Total", render: (row) => String(row?.metrics?.totalCandidates ?? row?.enrollmentCounts?.totalEnrollmentCount ?? row?.metrics?.enrolledCount ?? 0) },
            { key: "appeared", header: "Appeared", render: (row) => String(row?.metrics?.appearedCount || 0) },
            { key: "publishedAt", header: "Published At", render: (row) => formatDateTime(row.resultPublishedAt) },
            { key: "actions", header: "Actions", render: (row) => (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${row.id}/results`}>
                  Open Review
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${row.id}/late-enrollment`}>
                  Late Enrollment
                </Link>
              </div>
            ) }
          ]}
        />

        <PaginationBar
          total={total}
          limit={limit}
          offset={offset}
          onChange={({ limit: nextLimit, offset: nextOffset }) => {
            void load({ nextLimit, nextOffset });
          }}
        />
      </div>
    </section>
  );
}

export { SuperadminExamResultsControlCenterPage };
