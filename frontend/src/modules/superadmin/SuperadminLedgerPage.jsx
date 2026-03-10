import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { listLedger, exportLedgerCsv } from "../../services/ledgerService";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function SuperadminLedgerPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listLedger({ ...next, type: typeFilter });
      setRows(data.data?.items || []);
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load ledger.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
  }, []);

  const handleExport = async () => {
    try {
      const resp = await exportLedgerCsv({ type: typeFilter });
      downloadBlob(resp.data, "ledger_export.csv");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Export failed.");
    }
  };

  const columns = [
    { key: "type", header: "Type", render: (r) => r.type || "" },
    { key: "paymentMode", header: "Mode", render: (r) => r.paymentMode || "" },
    { key: "grossAmount", header: "Gross", render: (r) => String(r.grossAmount ?? "") },
    { key: "centerShare", header: "Center", render: (r) => String(r.centerShare ?? "") },
    { key: "franchiseShare", header: "Franchise", render: (r) => String(r.franchiseShare ?? "") },
    { key: "bpShare", header: "BP", render: (r) => String(r.bpShare ?? "") },
    { key: "platformShare", header: "Platform", render: (r) => String(r.platformShare ?? "") },
    {
      key: "level",
      header: "Level",
      render: (r) => r.feeLevel ? `${r.feeLevel.name} (${r.feeLevel.rank})` : ""
    },
    {
      key: "createdBy",
      header: "Created By",
      render: (r) => r.createdBy?.username || ""
    },
    { key: "createdAt", header: "Date", render: (r) => formatDateTime(r.createdAt) }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading ledger..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Financial Ledger</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Browse all financial transactions</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button secondary" type="button" onClick={handleExport} style={{ width: "auto" }}>
            Export CSV
          </button>
          <button className="button secondary" type="button" onClick={() => void load({ limit, offset })} style={{ width: "auto" }}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>Type:</label>
        <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 160 }}>
          <option value="">All</option>
          <option value="FEE_PAYMENT">Fee Payment</option>
          <option value="REGISTRATION">Registration</option>
          <option value="EXAM_FEE">Exam Fee</option>
          <option value="MATERIAL">Material</option>
          <option value="OTHER">Other</option>
        </select>
        <button className="button secondary" type="button" onClick={() => void load({ limit: limit, offset: 0 })} style={{ width: "auto" }}>
          Apply
        </button>
      </div>

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
      ) : null}

      <div className="card" style={{ overflow: "auto" }}>
        <DataTable columns={columns} rows={rows} keyField="id" />
      </div>

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset });
        }}
      />
    </section>
  );
}

export { SuperadminLedgerPage };
