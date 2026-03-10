import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getStudentMe, changeStudentPassword, updateStudentProfile } from "../../services/studentPortalService";

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function InfoRow({ label, value }) {
  return (
    <>
      <div className="info-grid__label">{label}</div>
      <div className="info-grid__value">{value || "—"}</div>
    </>
  );
}

function StudentProfilePage() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Password change form
  const [showPwForm, setShowPwForm] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getStudentMe()
      .then((res) => {
        if (!cancelled) setMe(res?.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const startEditing = () => {
    setEditData({
      email: me?.email || "",
      phonePrimary: me?.phonePrimary || "",
      guardianName: me?.guardianName || "",
      guardianPhone: me?.guardianPhone || "",
      guardianEmail: me?.guardianEmail || "",
      address: me?.address || "",
      state: me?.state || "",
      district: me?.district || ""
    });
    setEditError("");
    setEditSuccess("");
    setEditing(true);
  };

  const handleEditSave = async () => {
    setEditLoading(true);
    setEditError("");
    setEditSuccess("");
    try {
      await updateStudentProfile(editData);
      setEditSuccess("Profile updated successfully!");
      setEditing(false);
      // Refresh profile
      const res = await getStudentMe();
      setMe(res?.data?.data || null);
    } catch (err) {
      setEditError(err?.response?.data?.message || "Update failed.");
    } finally {
      setEditLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (!oldPw || !newPw) {
      setPwError("Please fill both password fields.");
      return;
    }
    if (newPw.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwLoading(true);
    try {
      await changeStudentPassword({ oldPassword: oldPw, newPassword: newPw });
      setPwSuccess("Password changed successfully.");
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
      setShowPwForm(false);
    } catch (err) {
      setPwError(err?.response?.data?.message || "Password change failed.");
    } finally {
      setPwLoading(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <div className="error">{error}</div>;
  if (!me) return <div className="error">Profile not found.</div>;

  const fullName = [me.firstName, me.lastName].filter(Boolean).join(" ") || "—";
  const centerLabel = me.centerName
    ? `${me.centerName}${me.centerCode ? ` (${me.centerCode})` : ""}`
    : me.centerCode || "—";
  const levelLabel = me.levelName || me.level?.name || "—";
  const courseLabel = me.courseCode || me.course?.code || "—";

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>My Profile</h2>
        {!editing && (
          <button className="button secondary" style={{ width: "auto", fontSize: 13 }} onClick={startEditing}>
            ✏️ Edit Profile
          </button>
        )}
      </div>

      {editSuccess && <div style={{ color: "#16a34a", fontSize: 13, padding: "6px 12px", background: "var(--color-bg-success-light)", borderRadius: 6 }}>{editSuccess}</div>}

      {/* Profile photo + name */}
      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {me.photoUrl ? (
          <img
            src={me.photoUrl}
            alt="Student photo"
            style={{ width: 128, height: 128, borderRadius: 16, objectFit: "cover", border: "1px solid var(--color-border)" }}
          />
        ) : (
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 16,
              background: "#2563eb",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 48
            }}
          >
            {(me.firstName || "?")[0].toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{fullName}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{me.admissionNo || "—"}</div>
        </div>
      </div>

      {/* Personal info */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Personal Information</div>
        {editing ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="form-field">
              <label className="form-label">Email</label>
              <input className="input" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} placeholder="student@example.com" />
            </div>
            <div className="form-field">
              <label className="form-label">Phone</label>
              <input className="input" value={editData.phonePrimary} onChange={(e) => setEditData({ ...editData, phonePrimary: e.target.value })} placeholder="Phone number" />
            </div>
            <div className="form-field">
              <label className="form-label">Address</label>
              <input className="input" value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })} placeholder="Address" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="form-field">
                <label className="form-label">District</label>
                <input className="input" value={editData.district} onChange={(e) => setEditData({ ...editData, district: e.target.value })} placeholder="District" />
              </div>
              <div className="form-field">
                <label className="form-label">State</label>
                <input className="input" value={editData.state} onChange={(e) => setEditData({ ...editData, state: e.target.value })} placeholder="State" />
              </div>
            </div>
          </div>
        ) : (
          <div className="info-grid">
            <InfoRow label="Admission No." value={me.admissionNo} />
            <InfoRow label="Email" value={me.email} />
            <InfoRow label="Gender" value={me.gender} />
            <InfoRow label="Date of Birth" value={formatDate(me.dateOfBirth)} />
            <InfoRow label="Phone" value={me.phonePrimary} />
            <InfoRow label="Address" value={[me.address, me.district, me.state].filter(Boolean).join(", ")} />
          </div>
        )}
      </div>

      {/* Guardian info */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Guardian Information</div>
        {editing ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="form-field">
              <label className="form-label">Guardian Name</label>
              <input className="input" value={editData.guardianName} onChange={(e) => setEditData({ ...editData, guardianName: e.target.value })} placeholder="Guardian name" />
            </div>
            <div className="form-field">
              <label className="form-label">Guardian Phone</label>
              <input className="input" value={editData.guardianPhone} onChange={(e) => setEditData({ ...editData, guardianPhone: e.target.value })} placeholder="Guardian phone" />
            </div>
            <div className="form-field">
              <label className="form-label">Guardian Email</label>
              <input className="input" value={editData.guardianEmail} onChange={(e) => setEditData({ ...editData, guardianEmail: e.target.value })} placeholder="Guardian email" />
            </div>
            {editError && <div className="error">{editError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="button" style={{ width: "auto" }} onClick={handleEditSave} disabled={editLoading}>
                {editLoading ? "Saving..." : "💾 Save Changes"}
              </button>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => { setEditing(false); setEditError(""); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="info-grid">
            <InfoRow label="Guardian Name" value={me.guardianName} />
            <InfoRow label="Guardian Phone" value={me.guardianPhone} />
            <InfoRow label="Guardian Email" value={me.guardianEmail} />
          </div>
        )}
      </div>

      {/* Academic info */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Academic Information</div>
        <div className="info-grid">
          <InfoRow label="Center" value={centerLabel} />
          <InfoRow label="Level" value={levelLabel} />
          <InfoRow label="Course" value={courseLabel} />
          <InfoRow label="Teacher" value={me.teacherName || me.currentTeacher?.username || "—"} />
        </div>
      </div>

      {/* Change password */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Change Password</div>
          {!showPwForm && (
            <button
              className="button secondary"
              style={{ width: "auto", fontSize: 13, padding: "6px 14px" }}
              onClick={() => { setShowPwForm(true); setPwError(""); setPwSuccess(""); }}
            >
              Change
            </button>
          )}
        </div>

        {pwSuccess && <div style={{ color: "#16a34a", fontSize: 13 }}>{pwSuccess}</div>}

        {showPwForm && (
          <form onSubmit={handlePasswordChange} style={{ display: "grid", gap: 10, maxWidth: 340 }}>
            <div className="form-field">
              <label className="form-label">Current Password</label>
              <input
                className="input"
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="form-field">
              <label className="form-label">New Password</label>
              <input
                className="input"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Confirm New Password</label>
              <input
                className="input"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {pwError && <div className="error">{pwError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="button" style={{ width: "auto" }} disabled={pwLoading}>
                {pwLoading ? "Saving..." : "Save Password"}
              </button>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => { setShowPwForm(false); setPwError(""); }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export { StudentProfilePage };
