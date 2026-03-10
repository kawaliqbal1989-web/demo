import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listSettlements, generateSettlements, markSettlementPaid } from "../../services/settlementService";

function SuperadminSettlementsPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [generating, setGenerating] = useState(false);

  const [markPaidId, setMarkPaidId] = useState(null);

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

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await generateSettlements({ year: Number(genYear), month: Number(genMonth) });
      const count = res?.data?.length || 0;
      setSuccessMsg(`Generated ${count} settlement(s) for ${genYear}-${String(genMonth).padStart(2, "0")}.`);
      await load({ limit, offset });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to generate settlements.");
    } finally {
      setGenerating(false);
    }
  };

  const executeMarkPaid = async () => {
    const id = markPaidId;
    setMarkPaidId(null);
    setError("");
    setSuccessMsg("");
    try {
      await markSettlementPaid(id);
      setSuccessMsg("Settlement marked as paid.");
      await load({ limit, offset });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to mark settlement as paid.");
    }
  };

  const columns = [
    {
      key: "bp",
      header: "Business Partner",
      render: (r) => r.businessPartner ? `${r.businessPartner.name} (${r.businessPartner.code || ""})` : r.businessPartnerId
    },
    {
      key: "period",
      header: "Period",
      render: (r) => `${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`
    },
    { key: "grossAmount", header: "Gross", render: (r) => String(r.grossAmount ?? "") },
    { key: "partnerEarnings", header: "Partner", render: (r) => String(r.partnerEarnings ?? "") },
    { key: "platformEarnings", header: "Platform", render: (r) => String(r.platformEarnings ?? "") },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "paidAt",
      header: "Paid At",
      render: (r) => (r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—")
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) =>
        r.status !== "PAID" ? (
          <button className="button secondary" style={{ width: "auto" }} onClick={() => setMarkPaidId(r.id)}>
            Mark Paid
          </button>
        ) : null
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
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Generate monthly settlements and track payment status</div>
        </div>
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
      ) : null}

      {successMsg ? (
        <div className="card"><p style={{ margin: 0, color: "#059669" }}>{successMsg}</p></div>
      ) : null}

      <div className="card">
        <h3 style={{ margin: "0 0 8px 0" }}>Generate Settlements</h3>
        <form onSubmit={handleGenerate} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Year</span>
            <input type="number" className="input" value={genYear} onChange={(e) => setGenYear(e.target.value)} style={{ width: 90 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Month</span>
            <input type="number" className="input" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} min="1" max="12" style={{ width: 60 }} />
          </label>
          <button className="button" type="submit" disabled={generating} style={{ width: "auto" }}>
            {generating ? "Generating..." : "Generate"}
          </button>
        </form>
      </div>

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

      <ConfirmDialog
        open={!!markPaidId}
        title="Mark Paid"
        message="Mark this settlement as paid?"
        confirmLabel="Mark Paid"
        onCancel={() => setMarkPaidId(null)}
        onConfirm={() => void executeMarkPaid()}
      />
    </section>
  );
}

export { SuperadminSettlementsPage };
