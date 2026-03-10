import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getMonthlyRevenue, getRevenueByType, getRevenueSummary } from "../../services/reportsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function SuperadminRevenuePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState(null);
  const [byType, setByType] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        ...(from ? { from } : {}),
        ...(to ? { to } : {})
      };

      const [s, t, m] = await Promise.all([
        getRevenueSummary(params),
        getRevenueByType(params),
        getMonthlyRevenue(params)
      ]);

      setSummary(s.data);
      setByType(t.data.items || []);
      setMonthly(m.data.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load revenue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!summary && loading) {
    return <LoadingState label="Loading revenue..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Revenue</h2>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>From (YYYY-MM-DD)</div>
            <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-02-01" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>To (YYYY-MM-DD)</div>
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-02-28" />
          </div>
        </div>

        <button className="button" style={{ width: "auto" }} onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Apply"}
        </button>

        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Total</h3>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{summary?.totalGrossAmount ?? 0}</div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>By Type</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {byType.map((row) => (
            <li key={row.type}>
              {row.type}: {row.grossAmount}
            </li>
          ))}
          {!byType.length ? <li style={{ color: "var(--color-text-muted)" }}>No data</li> : null}
        </ul>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Monthly</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {monthly.map((row) => (
            <li key={row.month}>
              {row.month}: {row.grossAmount}
            </li>
          ))}
          {!monthly.length ? <li style={{ color: "var(--color-text-muted)" }}>No data</li> : null}
        </ul>
      </div>
    </section>
  );
}

export { SuperadminRevenuePage };
