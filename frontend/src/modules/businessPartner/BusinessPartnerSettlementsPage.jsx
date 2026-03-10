import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listSettlements } from "../../services/settlementService";

function BusinessPartnerSettlementsPage() {
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
      setRows(data.data?.items || []);
      setLimit(data.data?.limit || next.limit);
      setOffset(data.data?.offset || next.offset);
      setTotal(data.data?.total || 0);
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
    { key: "grossAmount", header: "Gross", render: (r) => String(r.grossAmount ?? "") },
    { key: "partnerEarnings", header: "Partner Earnings", render: (r) => String(r.partnerEarnings ?? "") },
    { key: "platformEarnings", header: "Platform", render: (r) => String(r.platformEarnings ?? "") },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "paidAt",
      header: "Paid At",
      render: (r) => (r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—")
    }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading settlements..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Settlements</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Monthly settlement records</div>
        </div>
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
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

export { BusinessPartnerSettlementsPage };
