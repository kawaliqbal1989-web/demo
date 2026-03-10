import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getMyBusinessPartner, updateRevenueSplit } from "../../services/businessPartnersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function BusinessPartnerRevenueSplitPage() {
  const [partner, setPartner] = useState(null);
  const [centerSharePercent, setCenterSharePercent] = useState(0);
  const [franchiseSharePercent, setFranchiseSharePercent] = useState(0);
  const [bpSharePercent, setBpSharePercent] = useState(0);
  const [platformSharePercent, setPlatformSharePercent] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setError("");
    const data = await getMyBusinessPartner();
    const p = data.data;
    setPartner(p);
    setCenterSharePercent(p.centerSharePercent ?? 0);
    setFranchiseSharePercent(p.franchiseSharePercent ?? 0);
    setBpSharePercent(p.bpSharePercent ?? 0);
    setPlatformSharePercent(p.platformSharePercent ?? 100);
  };

  useEffect(() => {
    void load().catch((err) => setError(getFriendlyErrorMessage(err) || "Failed to load split config."));
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");
    setLoading(true);

    try {
      const sum = centerSharePercent + franchiseSharePercent + bpSharePercent + platformSharePercent;
      if (sum !== 100) {
        setError("Percents must sum to 100");
        return;
      }

      const updated = await updateRevenueSplit({
        id: partner.id,
        centerSharePercent,
        franchiseSharePercent,
        bpSharePercent,
        platformSharePercent
      });

      setPartner(updated.data);
      setSuccess("Saved");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Save failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!partner && !error) {
    return <LoadingState label="Loading split config..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Revenue Split</h2>
      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      {partner ? (
        <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Business Partner: {partner.code}</div>

          <label>
            Center %
            <input className="input" value={centerSharePercent} onChange={(e) => setCenterSharePercent(Number(e.target.value) || 0)} />
          </label>

          <label>
            Franchise %
            <input className="input" value={franchiseSharePercent} onChange={(e) => setFranchiseSharePercent(Number(e.target.value) || 0)} />
          </label>

          <label>
            BP %
            <input className="input" value={bpSharePercent} onChange={(e) => setBpSharePercent(Number(e.target.value) || 0)} />
          </label>

          <label>
            Platform %
            <input className="input" value={platformSharePercent} onChange={(e) => setPlatformSharePercent(Number(e.target.value) || 0)} />
          </label>

          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Sum: {centerSharePercent + franchiseSharePercent + bpSharePercent + platformSharePercent}
          </div>

          {success ? <div style={{ color: "var(--color-text-success)", fontWeight: 700 }}>{success}</div> : null}

          <button className="button" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export { BusinessPartnerRevenueSplitPage };
