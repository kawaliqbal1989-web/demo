import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listBusinessPartners, getBPPracticeEntitlements, updateBPPracticeEntitlements } from "../../services/businessPartnersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import toast from "react-hot-toast";

function SuperadminPracticeFeaturesPage() {
  const [partners, setPartners] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entitlements, setEntitlements] = useState({}); // keyed by bpId
  const [edits, setEdits] = useState({}); // local edits keyed by bpId
  const [saving, setSaving] = useState(null); // bpId being saved

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listBusinessPartners({ ...next, status: "ACTIVE" });
      const items = data.data.items || [];
      setPartners(items);
      setLimit(data.data.limit);
      setOffset(data.data.offset);

      // Load entitlements for each partner
      const entMap = {};
      await Promise.all(
        items.map(async (bp) => {
          try {
            const res = await getBPPracticeEntitlements(bp.id);
            entMap[bp.id] = res?.data || {};
          } catch (e) {
            entMap[bp.id] = {};
          }
        })
      );
      setEntitlements(entMap);
      setEdits({});
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load business partners.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
  }, []);

  const getEditValue = (bpId, featureKey, field, defaultVal) => {
    const key = `${bpId}-${featureKey}`;
    return edits[key]?.[field] ?? defaultVal;
  };

  const setEditValue = (bpId, featureKey, field, value) => {
    const key = `${bpId}-${featureKey}`;
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const handleSave = async (bp) => {
    const practiceKey = `${bp.id}-PRACTICE`;
    const abacusKey = `${bp.id}-ABACUS_PRACTICE`;
    const practiceEdits = edits[practiceKey] || {};
    const abacusEdits = edits[abacusKey] || {};

    const existingPractice = entitlements[bp.id]?.PRACTICE || {};
    const existingAbacus = entitlements[bp.id]?.ABACUS_PRACTICE || {};

    const practice = {
      isEnabled: practiceEdits.isEnabled ?? existingPractice.isEnabled ?? false,
      totalSeats: parseInt(practiceEdits.totalSeats ?? existingPractice.totalSeats ?? 0, 10)
    };
    const abacusPractice = {
      isEnabled: abacusEdits.isEnabled ?? existingAbacus.isEnabled ?? false,
      totalSeats: parseInt(abacusEdits.totalSeats ?? existingAbacus.totalSeats ?? 0, 10)
    };

    setSaving(bp.id);
    try {
      await updateBPPracticeEntitlements({ id: bp.id, practice, abacusPractice });
      toast.success(`Practice entitlements saved for ${bp.name}`);
      // Refresh single BP entitlement
      const res = await getBPPracticeEntitlements(bp.id);
      setEntitlements((prev) => ({ ...prev, [bp.id]: res?.data || {} }));
      // Clear edits for this BP
      setEdits((prev) => {
        const next = { ...prev };
        delete next[`${bp.id}-PRACTICE`];
        delete next[`${bp.id}-ABACUS_PRACTICE`];
        return next;
      });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to save entitlements");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !partners.length) {
    return <LoadingState label="Loading practice features..." />;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Practice Feature Entitlements</h2>
      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 13 }}>
        Assign Practice and Abacus Practice features to Business Partners. Each BP can then allocate seats to their Centers.
      </p>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="button secondary" onClick={() => load({ limit, offset })} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {partners.length === 0 ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          No active business partners found.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Business Partner</th>
              <th style={{ padding: 8 }}>Practice Enabled</th>
              <th style={{ padding: 8 }}>Practice Seats</th>
              <th style={{ padding: 8 }}>Practice Used</th>
              <th style={{ padding: 8 }}>Abacus Enabled</th>
              <th style={{ padding: 8 }}>Abacus Seats</th>
              <th style={{ padding: 8 }}>Abacus Used</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((bp) => {
              const ent = entitlements[bp.id] || {};
              const practiceEnt = ent.PRACTICE || {};
              const abacusEnt = ent.ABACUS_PRACTICE || {};

              const practiceEnabled = getEditValue(bp.id, "PRACTICE", "isEnabled", practiceEnt.isEnabled ?? false);
              const practiceSeats = getEditValue(bp.id, "PRACTICE", "totalSeats", practiceEnt.totalSeats ?? 0);
              const abacusEnabled = getEditValue(bp.id, "ABACUS_PRACTICE", "isEnabled", abacusEnt.isEnabled ?? false);
              const abacusSeats = getEditValue(bp.id, "ABACUS_PRACTICE", "totalSeats", abacusEnt.totalSeats ?? 0);

              const isSaving = saving === bp.id;

              return (
                <tr key={bp.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 8 }}>
                    <Link to={`/superadmin/business-partners/${bp.id}?mode=view`} style={{ fontWeight: 500 }}>
                      {bp.name}
                    </Link>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{bp.code}</div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      type="checkbox"
                      checked={practiceEnabled}
                      disabled={isSaving}
                      onChange={(e) => setEditValue(bp.id, "PRACTICE", "isEnabled", e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={practiceSeats}
                      disabled={isSaving || !practiceEnabled}
                      onChange={(e) => setEditValue(bp.id, "PRACTICE", "totalSeats", e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={{ padding: 8, color: "var(--color-text-muted)" }}>
                    {practiceEnt.assignedStudents ?? 0} / {practiceEnt.allocatedSeats ?? 0}
                    <div style={{ fontSize: 10 }}>assigned / allocated</div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      type="checkbox"
                      checked={abacusEnabled}
                      disabled={isSaving}
                      onChange={(e) => setEditValue(bp.id, "ABACUS_PRACTICE", "isEnabled", e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={abacusSeats}
                      disabled={isSaving || !abacusEnabled}
                      onChange={(e) => setEditValue(bp.id, "ABACUS_PRACTICE", "totalSeats", e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={{ padding: 8, color: "var(--color-text-muted)" }}>
                    {abacusEnt.assignedStudents ?? 0} / {abacusEnt.allocatedSeats ?? 0}
                    <div style={{ fontSize: 10 }}>assigned / allocated</div>
                  </td>
                  <td style={{ padding: 8 }}>
                    <button
                      className="button secondary"
                      onClick={() => handleSave(bp)}
                      disabled={isSaving}
                      style={{ fontSize: 12, padding: "4px 10px" }}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PaginationBar
        limit={limit}
        offset={offset}
        count={partners.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load(next);
        }}
      />
    </section>
  );
}

export { SuperadminPracticeFeaturesPage };
