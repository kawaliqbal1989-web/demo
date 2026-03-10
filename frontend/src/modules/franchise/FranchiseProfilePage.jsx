import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getMyFranchise, updateFranchiseProfile } from "../../services/franchiseService";

function FranchiseProfilePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    displayName: "",
    phonePrimary: "",
    emailOfficial: "",
    whatsappEnabled: false,
    logoUrl: ""
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void getMyFranchise()
      .then((data) => {
        if (cancelled) return;
        const p = data.data?.profile || null;
        setProfile(p);
        if (p) {
          setForm({
            displayName: p.displayName || "",
            phonePrimary: p.phonePrimary || "",
            emailOfficial: p.emailOfficial || "",
            whatsappEnabled: !!p.whatsappEnabled,
            logoUrl: p.logoUrl || ""
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load franchise profile.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {};
      if (form.displayName !== (profile?.displayName || "")) payload.displayName = form.displayName || null;
      if (form.phonePrimary !== (profile?.phonePrimary || "")) payload.phonePrimary = form.phonePrimary || null;
      if (form.emailOfficial !== (profile?.emailOfficial || "")) payload.emailOfficial = form.emailOfficial || null;
      if (form.whatsappEnabled !== !!profile?.whatsappEnabled) payload.whatsappEnabled = form.whatsappEnabled;
      if (form.logoUrl !== (profile?.logoUrl || "")) payload.logoUrl = form.logoUrl || null;

      if (!Object.keys(payload).length) {
        setSuccess("No changes to save.");
        setSaving(false);
        setEditing(false);
        return;
      }

      const res = await updateFranchiseProfile(payload);
      const updated = res.data;
      setProfile((prev) => ({ ...prev, ...updated }));
      setSuccess("Profile updated successfully.");
      setEditing(false);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setError("");
    setSuccess("");
    if (profile) {
      setForm({
        displayName: profile.displayName || "",
        phonePrimary: profile.phonePrimary || "",
        emailOfficial: profile.emailOfficial || "",
        whatsappEnabled: !!profile.whatsappEnabled,
        logoUrl: profile.logoUrl || ""
      });
    }
  };

  if (loading && !profile) {
    return <LoadingState label="Loading profile..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>Franchise Profile</h2>
            <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              {editing ? "Edit your franchise details below." : "View and manage franchise details."}
            </div>
          </div>
          {!editing ? (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>✏️ Edit</button>
          ) : null}
        </div>
        {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
        {success ? <div className="success" style={{ marginTop: 8, color: "#16a34a" }}>{success}</div> : null}
      </div>

      {/* Read-only identity */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>1) Identity (read-only)</h3>
        {profile?.logoUrl ? (
          <img
            src={profile.logoUrl}
            alt="Franchise logo"
            style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }}
          />
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, fontSize: 13 }}>
          <div style={{ color: "var(--color-text-muted)" }}>Franchise Code</div>
          <div>{profile?.code || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Franchise Name</div>
          <div>{profile?.name || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Status</div>
          <div>{profile?.status || "—"}</div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>2) Editable Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-label)" }}>Display Name</span>
            <input value={form.displayName} onChange={handleChange("displayName")} disabled={!editing} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-label)" }}>Phone</span>
            <input value={form.phonePrimary} onChange={handleChange("phonePrimary")} disabled={!editing} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-label)" }}>Email</span>
            <input type="email" value={form.emailOfficial} onChange={handleChange("emailOfficial")} disabled={!editing} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-label)" }}>Logo URL</span>
            <input value={form.logoUrl} onChange={handleChange("logoUrl")} disabled={!editing} placeholder="https://..." />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.whatsappEnabled} onChange={handleChange("whatsappEnabled")} disabled={!editing} />
          WhatsApp Enabled
        </label>
      </div>

      {/* Save / Cancel */}
      {editing ? (
        <div className="card" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "💾 Save Changes"}
          </button>
          <button className="btn" onClick={handleCancel} disabled={saving}>Cancel</button>
        </div>
      ) : null}
    </section>
  );
}

export { FranchiseProfilePage };
