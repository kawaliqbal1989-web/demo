import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getMyBusinessPartner } from "../../services/businessPartnersService";
import { updatePartnerProfile } from "../../services/partnerService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { resolveAssetUrl } from "../../utils/assetUrls";

function BusinessPartnerProfilePage() {
  const [partner, setPartner] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  /* editable form fields */
  const [displayName, setDisplayName] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await getMyBusinessPartner();
      const p = data.data || null;
      setPartner(p);
      if (p) {
        setDisplayName(p.displayName || "");
        setPrimaryPhone(p.primaryPhone || "");
        setAlternatePhone(p.alternatePhone || "");
        setSupportEmail(p.supportEmail || "");
        setWebsiteUrl(p.websiteUrl || "");
        setFacebookUrl(p.facebookUrl || "");
        setInstagramUrl(p.instagramUrl || "");
        setYoutubeUrl(p.youtubeUrl || "");
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load profile.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      await updatePartnerProfile({
        displayName: displayName || null,
        primaryPhone: primaryPhone || null,
        alternatePhone: alternatePhone || null,
        supportEmail: supportEmail || null,
        websiteUrl: websiteUrl || null,
        facebookUrl: facebookUrl || null,
        instagramUrl: instagramUrl || null,
        youtubeUrl: youtubeUrl || null
      });
      setSaveMsg("Profile updated.");
      setEditing(false);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (error && !partner) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Partner Profile</h2>
        <p className="error">{error}</p>
        <button className="button" style={{ width: "auto" }} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!partner) {
    return <LoadingState label="Loading profile..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Partner Profile</h2>
        {!editing ? (
          <button className="button" type="button" onClick={() => setEditing(true)} style={{ width: "auto" }}>
            Edit Profile
          </button>
        ) : null}
      </div>

      {saveMsg ? (
        <div className="card"><p style={{ margin: 0, color: "#059669" }}>{saveMsg}</p></div>
      ) : null}

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
      ) : null}

      {resolveAssetUrl(partner.logoUrl) ? (
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <img
            src={resolveAssetUrl(partner.logoUrl)}
            alt="Partner logo"
            style={{ width: 48, height: 48, borderRadius: 10, objectFit: "contain", background: "#fff" }}
          />
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 700 }}>{partner.displayName || partner.name}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Logo</div>
          </div>
        </div>
      ) : null}

      {!editing ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Code: {partner.code}</div>
          <div><strong>Name:</strong> {partner.name}</div>
          <div><strong>Display Name:</strong> {partner.displayName || "—"}</div>
          <div><strong>Status:</strong> {partner.status}</div>
          <div><strong>Contact Email:</strong> {partner.contactEmail || ""}</div>
          <div><strong>Support Email:</strong> {partner.supportEmail || "—"}</div>
          <div><strong>Phone:</strong> {partner.primaryPhone || "—"}</div>
          <div><strong>Alt Phone:</strong> {partner.alternatePhone || "—"}</div>
          <div><strong>Website:</strong> {partner.websiteUrl || "—"}</div>
          <div><strong>Facebook:</strong> {partner.facebookUrl || "—"}</div>
          <div><strong>Instagram:</strong> {partner.instagramUrl || "—"}</div>
          <div><strong>YouTube:</strong> {partner.youtubeUrl || "—"}</div>
          <div><strong>Subscription:</strong> {partner.subscriptionStatus}</div>
        </div>
      ) : (
        <form className="card" onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Code: {partner.code}</div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Display Name</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Primary Phone</span>
            <input className="input" value={primaryPhone} onChange={(e) => setPrimaryPhone(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Alternate Phone</span>
            <input className="input" value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Support Email</span>
            <input className="input" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Website URL</span>
            <input className="input" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Facebook URL</span>
            <input className="input" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Instagram URL</span>
            <input className="input" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>YouTube URL</span>
            <input className="input" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button className="button" type="submit" disabled={saving} style={{ width: "auto" }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button className="button secondary" type="button" onClick={() => { setEditing(false); void load(); }} style={{ width: "auto" }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export { BusinessPartnerProfilePage };
