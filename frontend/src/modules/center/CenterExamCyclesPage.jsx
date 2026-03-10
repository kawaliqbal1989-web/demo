import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listExamCycles } from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function CenterExamCyclesPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listExamCycles(next);
      setRows(data?.data?.items || []);
      setLimit(data?.data?.limit ?? next.limit);
      setOffset(data?.data?.offset ?? next.offset);
      setTotal(data?.data?.total ?? 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam cycles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam cycles..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Exams</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Prepare combined enrollment list and submit to Franchise</div>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--muted)" }}>Total: {total}</div>
        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "code", header: "Exam Code" },
          { key: "name", header: "Exam Name" },
          { key: "bp", header: "Business Partner", render: (r) => r?.businessPartner?.name || "" },
          {
            key: "enrollWin",
            header: "Enrollment Window",
            render: (r) => `${formatDateTime(r.enrollmentStartAt)} → ${formatDateTime(r.enrollmentEndAt)}`
          },
          {
            key: "examWin",
            header: "Exam Window",
            render: (r) => `${formatDateTime(r.examStartsAt)} → ${formatDateTime(r.examEndsAt)}`
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <Link className="button secondary" style={{ width: "auto" }} to={`/center/exam-cycles/${r.id}`}>
                Manage Enrollment
              </Link>
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
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load(next);
        }}
      />
    </section>
  );
}

export { CenterExamCyclesPage };
