import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getTeacherMe, updateTeacherProfile } from "../../services/teacherPortalService";

function TeacherProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phonePrimary: ""
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getTeacherMe();
      const data = res?.data || null;
      setMe(data);
      if (data) {
        setForm({
          fullName: data.fullName || "",
          phonePrimary: data.phonePrimary || ""
        });
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {};
      if (form.fullName !== (me?.fullName || "")) payload.fullName = form.fullName;
      if (form.phonePrimary !== (me?.phonePrimary || "")) payload.phonePrimary = form.phonePrimary || null;

      if (!Object.keys(payload).length) {
        setSuccess("No changes to save.");
        setSaving(false);
        setEditing(false);
        return;
      }

      await updateTeacherProfile(payload);
      setSuccess("Profile updated successfully.");
      setEditing(false);
      await load();
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
    if (me) {
      setForm({
        fullName: me.fullName || "",
        phonePrimary: me.phonePrimary || ""
      });
    }
  };

  if (loading) {
    return <LoadingState label="Loading profile..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 4 }}>Teacher Profile</h2>
            <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              {editing ? "Edit your details below." : "View and manage your profile."}
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
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, fontSize: 13 }}>
          <div style={{ color: "var(--color-text-muted)" }}>Teacher Code</div>
          <div>{me?.teacherCode || me?.username || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Username</div>
          <div>{me?.username || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Email</div>
          <div>{me?.email || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Status</div>
          <div>{me?.status || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Role</div>
          <div>{me?.role || "TEACHER"}</div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>2) Editable Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-label)" }}>Full Name</span>
            <input value={form.fullName} onChange={handleChange("fullName")} disabled={!editing} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-label)" }}>Phone</span>
            <input value={form.phonePrimary} onChange={handleChange("phonePrimary")} disabled={!editing} />
          </label>
        </div>
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

      {/* Quick Links */}
      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="button secondary" style={{ width: "auto" }} to="/change-password">🔑 Change Password</Link>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/dashboard">🏠 Dashboard</Link>
      </div>
    </section>
  );
}

export { TeacherProfilePage };
