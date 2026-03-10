import { useEffect, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listFranchiseMargins } from "../../services/franchiseService";

function FranchiseMarginsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listFranchiseMargins();
      setRows(data.data.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load margins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const columns = [
    { key: "marginPercent", header: "Margin %", render: (r) => String(r.marginPercent) },
    { key: "effectiveFrom", header: "Effective From", render: (r) => new Date(r.effectiveFrom).toLocaleString() },
    { key: "active", header: "Active", render: (r) => (r.isActive ? "Yes" : "No") }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading margins..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Margins</h2>
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
        {!rows.length ? <div style={{ color: "var(--color-text-muted)", marginTop: 10 }}>No margins found.</div> : null}
      </div>
    </section>
  );
}

export { FranchiseMarginsPage };
