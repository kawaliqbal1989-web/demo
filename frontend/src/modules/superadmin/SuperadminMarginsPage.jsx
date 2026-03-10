import { useEffect, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listMargins, setMargin } from "../../services/marginsService";
import { listBusinessPartners } from "../../services/businessPartnersService";

function SuperadminMarginsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [partners, setPartners] = useState([]);

  const [selectedBp, setSelectedBp] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [marginsRes, partnersRes] = await Promise.all([
        listMargins(),
        listBusinessPartners({ limit: 200, offset: 0 })
      ]);
      setRows(marginsRes?.data?.items || []);
      setPartners(partnersRes?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load margins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedBp || !marginPercent) return;
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      await setMargin(selectedBp, { marginPercent: Number(marginPercent) });
      setSaveMsg("Margin updated.");
      setMarginPercent("");
      setSelectedBp("");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to save margin.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "bp",
      header: "Business Partner",
      render: (r) => {
        const p = partners.find((p) => p.id === r.businessPartnerId);
        return p ? `${p.name} (${p.code || ""})` : r.businessPartnerId;
      }
    },
    { key: "marginPercent", header: "Margin %", render: (r) => `${r.marginPercent}%` },
    {
      key: "effectiveFrom",
      header: "Effective From",
      render: (r) => (r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString() : "")
    },
    {
      key: "isActive",
      header: "Active",
      render: (r) => (r.isActive ? "✅ Yes" : "No")
    },
    {
      key: "createdAt",
      header: "Created",
      render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "")
    }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading margins..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Margins</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Set margin percentages per business partner</div>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ margin: "0 0 8px 0" }}>Set Margin</h3>
        <form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Business Partner</span>
            <select value={selectedBp} onChange={(e) => setSelectedBp(e.target.value)} className="input" style={{ minWidth: 200 }}>
              <option value="">Select BP...</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Margin %</span>
            <input
              type="number"
              className="input"
              value={marginPercent}
              onChange={(e) => setMarginPercent(e.target.value)}
              placeholder="e.g. 10"
              min="0"
              max="100"
              step="0.01"
              style={{ width: 100 }}
            />
          </label>
          <button className="button" type="submit" disabled={saving || !selectedBp || !marginPercent} style={{ width: "auto" }}>
            {saving ? "Saving..." : "Save Margin"}
          </button>
          {saveMsg ? <span style={{ color: "#059669", fontSize: 13 }}>{saveMsg}</span> : null}
        </form>
      </div>

      <div className="card">
        <DataTable columns={columns} rows={rows} keyField="id" />
      </div>
    </section>
  );
}

export { SuperadminMarginsPage };
