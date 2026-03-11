import { useEffect, useState, useRef, useCallback } from "react";
import { LoadingState } from "../../components/LoadingState";
import {
  getCertificateTemplate,
  upsertCertificateTemplate,
  uploadCertificateAsset
} from "../../services/partnerService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { generateCertificatePdf, preloadTemplateImages, generateQrDataUrl } from "../../utils/pdfExport";
import { CertificateVisualEditor } from "../../components/CertificateVisualEditor";

const ASSET_TYPES = [
  {
    key: "signature",
    label: "Authorized Signature",
    description: "Signature image for the certificate (replaces the Director line)",
    urlField: "signatureImageUrl"
  },
  {
    key: "affiliation-logo",
    label: "Affiliation / Organization Logo",
    description: "Logo of affiliated organization displayed on the certificate",
    urlField: "affiliationLogoUrl"
  },
  {
    key: "stamp",
    label: "Official Stamp / Seal",
    description: "Official stamp or seal placed on the certificate",
    urlField: "stampImageUrl"
  },
  {
    key: "background",
    label: "Background / Watermark",
    description: "Custom background image or watermark for the certificate",
    urlField: "backgroundImageUrl"
  }
];

function BusinessPartnerCertificateTemplatePage() {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [uploading, setUploading] = useState({});

  const [title, setTitle] = useState("Certificate of Achievement");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryDesignation, setSignatoryDesignation] = useState("");
  const [layout, setLayout] = useState(null);
  const layoutRef = useRef(null);

  const handleLayoutChange = useCallback((newLayout) => {
    layoutRef.current = newLayout;
  }, []);

  const fileInputRefs = useRef({});

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getCertificateTemplate();
      const t = res.data?.template || {};
      setTemplate(t);
      setTitle(t.title || "Certificate of Achievement");
      setSignatoryName(t.signatoryName || "");
      setSignatoryDesignation(t.signatoryDesignation || "");
      setLayout(t.layout || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load template.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSaveText = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await upsertCertificateTemplate({ title, signatoryName, signatoryDesignation, layout: layoutRef.current });
      setTemplate(res.data?.template || template);
      setSaveMsg("Template saved.");
    } catch (err) {
      setSaveMsg(getFriendlyErrorMessage(err) || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (assetType, file) => {
    setUploading((prev) => ({ ...prev, [assetType]: true }));
    try {
      const res = await uploadCertificateAsset(assetType, file);
      setTemplate(res.data?.template || template);
      setSaveMsg(`${assetType} uploaded.`);
    } catch (err) {
      setSaveMsg(getFriendlyErrorMessage(err) || `Upload failed for ${assetType}.`);
    } finally {
      setUploading((prev) => ({ ...prev, [assetType]: false }));
    }
  };

  const handleFileChange = (assetType) => (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(assetType, file);
      e.target.value = "";
    }
  };

  const handlePreview = async () => {
    const rawTemplate = {
      title: title || "Certificate of Achievement",
      signatoryName,
      signatoryDesignation,
      signatureImageUrl: template?.signatureImageUrl || null,
      affiliationLogoUrl: template?.affiliationLogoUrl || null,
      stampImageUrl: template?.stampImageUrl || null,
      backgroundImageUrl: template?.backgroundImageUrl || null,
      bpLogoUrl: template?.bpLogoUrl || null,
      layout: layoutRef.current || layout || null
    };
    const enrichedTemplate = await preloadTemplateImages(rawTemplate);
    let qrDataUrl = null;
    try {
      qrDataUrl = await generateQrDataUrl(`${window.location.origin}/verify/PREVIEW-SAMPLE`);
    } catch (_) { /* ignore */ }
    const doc = generateCertificatePdf({
      studentName: "Sample Student",
      levelName: "Level 1 \u2014 Foundation",
      certificateNumber: "CERT-PREVIEW-0001",
      issuedAt: new Date().toISOString(),
      template: enrichedTemplate,
      qrDataUrl
    });
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  if (loading) return <LoadingState label="Loading certificate template..." />;

  return (
    <section style={{ display: "grid", gap: 24, maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Certificate Template</h2>
        <button
          onClick={handlePreview}
          style={{
            padding: "8px 20px",
            background: "var(--color-primary)",
            color: "#fff",
            border: "1px solid var(--color-primary)",
            borderRadius: 6,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          🔍 Preview Certificate
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "var(--color-bg-danger-light)", color: "var(--color-text-danger)", border: "1px solid var(--color-border-danger)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {saveMsg && (
        <div style={{ padding: 10, background: "var(--color-bg-success-light)", color: "var(--color-text-success)", border: "1px solid var(--color-border-success-light)", borderRadius: 8, fontSize: 14 }}>
          {saveMsg}
        </div>
      )}

      {/* Text settings */}
      <form onSubmit={handleSaveText} style={{ display: "grid", gap: 16, background: "var(--color-bg-card)", padding: 24, borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Certificate Details</h3>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-label)" }}>Certificate Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Certificate of Achievement"
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-strong)", background: "var(--color-bg-card)", color: "var(--color-text-primary)", fontSize: 14 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-label)" }}>Signatory Name</label>
            <input
              type="text"
              value={signatoryName}
              onChange={(e) => setSignatoryName(e.target.value)}
              placeholder="e.g. John Doe"
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-strong)", background: "var(--color-bg-card)", color: "var(--color-text-primary)", fontSize: 14 }}
            />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-label)" }}>Signatory Designation</label>
            <input
              type="text"
              value={signatoryDesignation}
              onChange={(e) => setSignatoryDesignation(e.target.value)}
              placeholder="e.g. Director"
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border-strong)", background: "var(--color-bg-card)", color: "var(--color-text-primary)", fontSize: 14 }}
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "8px 24px",
              background: saving ? "var(--color-text-faint)" : "var(--color-primary)",
              color: "#fff",
              border: "1px solid transparent",
              borderRadius: 6,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer"
            }}
          >
            {saving ? "Saving..." : "Save Details"}
          </button>
        </div>
      </form>

      {/* Asset uploads */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {ASSET_TYPES.map((asset) => {
          const currentUrl = template?.[asset.urlField] || null;
          const isUploading = uploading[asset.key] || false;

          return (
            <div
              key={asset.key}
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: 20,
                display: "grid",
                gap: 12
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{asset.label}</h4>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>{asset.description}</p>
              </div>

              {currentUrl ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border-divider)", borderRadius: 8 }}>
                  <img
                    src={currentUrl}
                    alt={asset.label}
                    style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 80,
                    background: "var(--color-bg-subtle)",
                    border: "1px dashed var(--color-border-strong)",
                    borderRadius: 8,
                    color: "var(--color-text-faint)",
                    fontSize: 13
                  }}
                >
                  No image uploaded
                </div>
              )}

              <input
                type="file"
                accept="image/png,image/jpeg"
                ref={(el) => (fileInputRefs.current[asset.key] = el)}
                onChange={handleFileChange(asset.key)}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRefs.current[asset.key]?.click()}
                disabled={isUploading}
                style={{
                  padding: "7px 16px",
                  background: isUploading ? "var(--color-bg-badge)" : "var(--color-bg-muted)",
                  color: "var(--color-text-label)",
                  border: "1px solid var(--color-border-strong)",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: isUploading ? "not-allowed" : "pointer"
                }}
              >
                {isUploading ? "Uploading..." : currentUrl ? "Replace Image" : "Upload Image"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Visual Layout Editor */}
      <div style={{ background: "var(--color-bg-card)", padding: 24, borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <CertificateVisualEditor layout={layout} onChange={handleLayoutChange} template={template} />
      </div>
    </section>
  );
}

export { BusinessPartnerCertificateTemplatePage };
