import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listExamCycles } from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDateRange(startValue, endValue) {
  return `${formatDateTime(startValue)} → ${formatDateTime(endValue)}`;
}

function SuperadminExamCyclesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ limit: nextLimit = 20, offset: nextOffset = 0 } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCycles({ limit: nextLimit, offset: nextOffset });
      setRows(data?.data?.items || []);
      setLimit(data?.data?.limit ?? nextLimit);
      setOffset(data?.data?.offset ?? nextOffset);
      setTotal(data?.data?.total ?? 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ limit: 20, offset: 0 });
  }, [load]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam cycles..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Exam Cycles</h2>
        <div style={{ display: "flex", gap: 10 }}>

          <button
            className="button"
            type="button"
            onClick={() => navigate("/superadmin/exam-cycles/new")}
            style={{ width: "auto" }}
          >
            Create Exam Cycle
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--muted)" }}>
          Total: {total}
        </div>
        <div style={{ color: "var(--muted)" }}>
          Showing: {rows.length}
        </div>
        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        emptyMessage={error ? "Unable to load exam cycles. Use Refresh to retry." : "No exam cycles found."}
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "bpCode", header: "BP Code", render: (r) => r?.businessPartner?.code || "Unassigned" },
          { key: "bpName", header: "BP Name", render: (r) => r?.businessPartner?.name || "No business partner linked" },
          { key: "enrollment", header: "Enrollment", render: (r) => formatDateRange(r.enrollmentStartAt, r.enrollmentEndAt) },
          { key: "exam", header: "Exam Window", render: (r) => formatDateRange(r.examStartsAt, r.examEndsAt) },
          { key: "duration", header: "Duration", render: (r) => `${r.examDurationMinutes} min` },
          { key: "resultStatus", header: "Result" },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/pending`}>
                  Pending
                </Link>
                <Link className="button secondary" style={{ width: "auto" }} to={`/superadmin/exam-cycles/${r.id}/results`}>
                  Results
                </Link>
              </div>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load(next);
        }}
      />
    </section>
  );
}

export { SuperadminExamCyclesPage };
