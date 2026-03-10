import { useEffect, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import {
  listCenterAllocations,
  updateCenterAllocation,
  getOwnUsage
} from "../../services/practiceAllocationService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import toast from "react-hot-toast";

function BusinessPartnerPracticeAllocationsPage() {
  const [centers, setCenters] = useState([]);
  const [usage, setUsage] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null); // centerId being saved or "all"
  const [error, setError] = useState("");
  const [featureFilter, setFeatureFilter] = useState(""); // "" | "PRACTICE" | "ABACUS_PRACTICE"

  // Local edits - keyed by centerId
  const [edits, setEdits] = useState({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [centersRes, usageRes] = await Promise.all([
        listCenterAllocations({ featureKey: featureFilter || undefined }),
        getOwnUsage()
      ]);
      setCenters(centersRes?.data?.centers || []);
      setEntitlements(centersRes?.data?.entitlements || null);
      setUsage(usageRes?.data || null);
      setEdits({}); // reset edits on load
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load practice allocations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [featureFilter]);

  const getEditValue = (centerId, featureKey, field, defaultVal) => {
    const key = `${centerId}-${featureKey}`;
    return edits[key]?.[field] ?? defaultVal;
  };

  const setEditValue = (centerId, featureKey, field, value) => {
    const key = `${centerId}-${featureKey}`;
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const handleSave = async (center, featureKey, allocation) => {
    const key = `${center.centerId}-${featureKey}`;
    const editData = edits[key] || {};
    const allocatedSeats = editData.allocatedSeats ?? allocation?.allocatedSeats ?? 0;

    setSaving(key);
    try {
      await updateCenterAllocation({
        centerId: center.centerId,
        featureKey,
        allocatedSeats: parseInt(allocatedSeats, 10) || 0
      });
      toast.success(`${featureKey} allocation updated for ${center.centerName}`);
      // Refresh
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to update allocation");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !centers.length) {
    return <LoadingState label="Loading practice allocations..." />;
  }

  // Build flat rows for table: each center + feature combo
  const rows = [];
  for (const center of centers) {
    const features = ["PRACTICE", "ABACUS_PRACTICE"];
    for (const fk of features) {
      if (featureFilter && featureFilter !== fk) continue;

      const alloc = center[fk];
      const entitlement = entitlements?.[fk];
      rows.push({
        uid: `${center.centerId}-${fk}`,
        centerId: center.centerId,
        centerName: center.centerName,
        centerCode: center.centerCode,
        featureKey: fk,
        isEnabled: entitlement?.isEnabled || false,
        allocatedSeats: alloc?.allocatedSeats || 0,
        usedSeats: alloc?.assignedStudents || 0,
        _alloc: alloc,
        _center: center
      });
    }
  }

  const renderFeatureInfo = (featureKey) => {
    const info = usage?.[featureKey];
    if (!info) return null;
    return (
      <div style={{ padding: 8, background: "var(--color-bg-muted)", borderRadius: 6, fontSize: 13 }}>
        <strong>{featureKey === "PRACTICE" ? "Practice" : "Abacus Practice"}</strong>
        <div>Entitled Seats: {info.purchasedSeats ?? "—"}</div>
        <div>Allocated to Centers: {info.allocatedSeats ?? 0}</div>
        <div>Remaining: {(info.purchasedSeats ?? 0) - (info.allocatedSeats ?? 0)}</div>
      </div>
    );
  };

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Practice Feature Allocations</h2>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      )}

      {/* Usage summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {renderFeatureInfo("PRACTICE")}
        {renderFeatureInfo("ABACUS_PRACTICE")}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 13 }}>Filter by Feature:</label>
        <select
          className="input"
          style={{ width: "auto" }}
          value={featureFilter}
          onChange={(e) => setFeatureFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="PRACTICE">Practice</option>
          <option value="ABACUS_PRACTICE">Abacus Practice</option>
        </select>
        <button className="button secondary" onClick={() => load()} style={{ marginLeft: "auto" }}>
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          No centers to allocate. Centers must be created first.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Center</th>
              <th style={{ padding: 8 }}>Feature</th>
              <th style={{ padding: 8 }}>BP Enabled</th>
              <th style={{ padding: 8 }}>Allocated Seats</th>
              <th style={{ padding: 8 }}>Used</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.centerId}-${row.featureKey}`;
              const isSaving = saving === key;
              const currentEnabled = getEditValue(row.centerId, row.featureKey, "isEnabled", row.isEnabled);
              const currentSeats = getEditValue(row.centerId, row.featureKey, "allocatedSeats", row.allocatedSeats);

              return (
                <tr key={row.uid} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 8 }}>
                    {row.centerName}
                    {row.centerCode && <span style={{ color: "var(--color-text-muted)" }}> ({row.centerCode})</span>}
                  </td>
                  <td style={{ padding: 8 }}>{row.featureKey === "PRACTICE" ? "Practice" : "Abacus Practice"}</td>
                  <td style={{ padding: 8, color: row.isEnabled ? "var(--color-text-success)" : "var(--color-text-danger)" }}>{row.isEnabled ? "Yes" : "No"}</td>
                  <td style={{ padding: 8 }}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={currentSeats}
                      disabled={isSaving || !row.isEnabled}
                      onChange={(e) => setEditValue(row.centerId, row.featureKey, "allocatedSeats", e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td style={{ padding: 8 }}>{row.usedSeats}</td>
                  <td style={{ padding: 8 }}>
                    <button
                      className="button secondary"
                      onClick={() => handleSave(row._center, row.featureKey, row._alloc)}
                      disabled={isSaving || !row.isEnabled}
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
    </section>
  );
}

export { BusinessPartnerPracticeAllocationsPage };
