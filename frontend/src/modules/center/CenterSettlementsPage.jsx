import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listSettlements } from "../../services/settlementService";

function CenterSettlementsPage() {
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
      const data = await listSettlements(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
      setTotal(data.data.total || 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load settlements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
  }, []);

  const columns = [
    {
      key: "period",
      header: "Period",
      render: (r) => `${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`
    },
    { key: "grossAmount", header: "Gross", render: (r) => String(r.grossAmount) },
    { key: "partnerEarnings", header: "Partner", render: (r) => String(r.partnerEarnings) },
    { key: "platformEarnings", header: "Platform", render: (r) => String(r.platformEarnings) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading settlements..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Settlements</h2>
        <button className="button secondary" type="button" onClick={() => load({ limit, offset })} style={{ width: "auto" }}>
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
      </div>

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset });
        }}
      />
    </section>
  );
}

export { CenterSettlementsPage };
