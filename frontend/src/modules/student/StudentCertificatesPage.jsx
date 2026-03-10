import { useEffect, useRef, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { listStudentCertificates, getStudentMe } from "../../services/studentPortalService";
import { getMyBranding } from "../../services/brandingService";
import { generateCertificatePdf, preloadTemplateImages, generateQrDataUrl } from "../../utils/pdfExport";

function CertificateCard({ cert, studentName, template, onPrint, onDownloadPdf }) {
  const isRevoked = cert.status === "REVOKED";
  const certTitle = template?.title || "Certificate of Achievement";

  return (
    <div
      className="card"
      style={{
        background: isRevoked ? "var(--color-bg-danger-light)" : "var(--color-bg-warning)",
        border: isRevoked ? `2px solid var(--color-border-danger-light)` : `2px solid var(--color-border-warning)`,
        textAlign: "center",
        padding: "24px 16px",
        position: "relative",
        opacity: isRevoked ? 0.6 : 1,
        overflow: "hidden"
      }}
    >
      {template?._backgroundImageData ? (
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${template._backgroundImageData})`,
          backgroundSize: "cover", backgroundPosition: "center",
          opacity: 0.12, pointerEvents: "none", zIndex: 0
        }} />
      ) : null}

      <div style={{ position: "relative", zIndex: 1 }}>
        {isRevoked ? (
          <div
            style={{
              position: "absolute",
              top: -12,
              right: -4,
              background: "#ef4444",
              color: "#fff",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700
            }}
          >
            REVOKED
          </div>
        ) : null}

        {(template?._bpLogoData || template?._affiliationLogoData) ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>{template?._bpLogoData ? <img src={template._bpLogoData} alt="BP Logo" style={{ height: 36, objectFit: "contain" }} /> : <div style={{ width: 36 }} />}</div>
            <div>{template?._affiliationLogoData ? <img src={template._affiliationLogoData} alt="Affiliation Logo" style={{ height: 36, objectFit: "contain" }} /> : <div style={{ width: 36 }} />}</div>
          </div>
        ) : null}

        <div style={{ fontSize: 32 }}>🏆</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 8, color: "var(--color-text-warning)" }}>{certTitle}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>This is to certify that</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8, color: "#1e293b" }}>{studentName}</div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
          has successfully completed
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4, color: "#2563eb" }}>
          {cert.levelName}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 16,
            justifyContent: "center",
            fontSize: 11,
            color: "var(--color-text-muted)",
            flexWrap: "wrap"
          }}
        >
          <span>Certificate #: {cert.certificateNumber}</span>
          <span>Issued: {new Date(cert.issuedAt).toLocaleDateString()}</span>
        </div>

        {(template?._signatureImageData || template?._stampImageData) ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16, padding: "0 8px" }}>
            <div style={{ textAlign: "center" }}>
              {template?._signatureImageData ? <img src={template._signatureImageData} alt="Signature" style={{ height: 28, objectFit: "contain" }} /> : null}
              <div style={{ borderTop: "1px solid #9ca3af", width: 100, margin: "4px auto 0" }} />
              {template?.signatoryName ? <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280" }}>{template.signatoryName}</div> : null}
              <div style={{ fontSize: 9, color: "#9ca3af" }}>{template?.signatoryDesignation || "Director"}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              {template?._stampImageData ? <img src={template._stampImageData} alt="Official Stamp" style={{ height: 40, objectFit: "contain" }} /> : null}
            </div>
          </div>
        ) : null}

        {isRevoked && cert.revokedAt ? (
          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
            Revoked: {new Date(cert.revokedAt).toLocaleDateString()} {cert.reason ? `— ${cert.reason}` : ""}
          </div>
        ) : null}

        {!isRevoked ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button
              className="button secondary"
              style={{ width: "auto", fontSize: 12 }}
              onClick={() => onPrint(cert)}
            >
              🖨️ Print
            </button>
            <button
              className="button secondary"
              style={{ width: "auto", fontSize: 12 }}
              onClick={() => onDownloadPdf(cert)}
            >
              📄 Download PDF
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StudentCertificatesPage() {
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [studentName, setStudentName] = useState("");
  const [template, setTemplate] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    Promise.all([listStudentCertificates(), getStudentMe(), getMyBranding()])
      .then(([certsRes, meRes, brandingRes]) => {
        setCerts(Array.isArray(certsRes.data?.data) ? certsRes.data.data : []);
        const me = meRes.data?.data;
        setStudentName(me?.fullName || "Student");
        const certTemplate = brandingRes?.data?.certificateTemplate;
        if (certTemplate) {
          preloadTemplateImages(certTemplate).then(setTemplate).catch(() => setTemplate(null));
        }
      })
      .catch(() => setError("Failed to load certificates."))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = (cert) => {
    const printWindow = window.open("", "_blank", "width=900,height=650");
    if (!printWindow) return;

    // Escape HTML entities to prevent XSS from API-sourced values
    const esc = (str) => String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const certTitle = esc(template?.title || "Certificate of Achievement");
    const bgImg = template?._backgroundImageData || "";
    const bpLogo = template?._bpLogoData || "";
    const affLogo = template?._affiliationLogoData || "";
    const sigImg = template?._signatureImageData || "";
    const stampImg = template?._stampImageData || "";
    const sigName = esc(template?.signatoryName || "");
    const sigDesignation = esc(template?.signatoryDesignation || "Director");
    const escapedStudentName = esc(studentName);
    const escapedLevelName = esc(cert.levelName);
    const escapedCertNumber = esc(cert.certificateNumber);
    const escapedIssuedDate = esc(new Date(cert.issuedAt).toLocaleDateString());

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Certificate - ${escapedCertNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Georgia', serif; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            min-height: 100vh; 
            background: #fff;
          }
          .cert {
            width: 800px;
            padding: 48px;
            border: 4px double #d97706;
            text-align: center;
            position: relative;
            overflow: hidden;
          }
          .cert-bg {
            position: absolute; inset: 0;
            background-size: cover; background-position: center;
            opacity: 0.10; pointer-events: none; z-index: 0;
          }
          .cert-content { position: relative; z-index: 1; }
          .cert h1 { font-size: 28px; color: #92400e; margin-bottom: 24px; }
          .cert .name { font-size: 24px; font-weight: bold; margin: 16px 0; }
          .cert .level { font-size: 20px; color: #2563eb; margin: 8px 0; }
          .cert .meta { font-size: 12px; color: #6b7280; margin-top: 24px; }
          .cert .logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
          .cert .logos img { height: 50px; object-fit: contain; }
          .cert .footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px; padding: 0 16px; }
          .cert .sig-block { text-align: center; }
          .cert .sig-block img { height: 36px; object-fit: contain; }
          .cert .sig-line { border-top: 1px solid #9ca3af; width: 140px; margin: 4px auto 0; }
          .cert .sig-name { font-size: 11px; font-weight: bold; color: #6b7280; }
          .cert .sig-title { font-size: 10px; color: #9ca3af; }
          .cert .stamp-block img { height: 60px; object-fit: contain; }
          @media print { body { margin: 0; } .cert { border-width: 4px; } }
        </style>
      </head>
      <body>
        <div class="cert">
          ${bgImg ? `<div class="cert-bg" style="background-image: url(${bgImg})"></div>` : ""}
          <div class="cert-content">
            ${(bpLogo || affLogo) ? `<div class="logos">
              <div>${bpLogo ? `<img src="${bpLogo}" alt="Logo" />` : ""}</div>
              <div>${affLogo ? `<img src="${affLogo}" alt="Affiliation Logo" />` : ""}</div>
            </div>` : ""}
            <div style="font-size: 48px;">🏆</div>
            <h1>${certTitle}</h1>
            <p>This is to certify that</p>
            <div class="name">${escapedStudentName}</div>
            <p>has successfully completed</p>
            <div class="level">${escapedLevelName}</div>
            <div class="meta">
              Certificate #: ${escapedCertNumber} &nbsp;&nbsp; 
              Issued: ${escapedIssuedDate}
            </div>
            <div class="footer-row">
              <div class="sig-block">
                ${sigImg ? `<img src="${sigImg}" alt="Signature" />` : ""}
                <div class="sig-line"></div>
                ${sigName ? `<div class="sig-name">${sigName}</div>` : ""}
                <div class="sig-title">${sigDesignation}</div>
              </div>
              <div class="stamp-block">
                ${stampImg ? `<img src="${stampImg}" alt="Official Stamp" />` : ""}
              </div>
            </div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPdf = async (cert) => {
    let qrDataUrl = null;
    if (cert.verificationToken) {
      const verifyUrl = `${window.location.origin}/verify/${cert.verificationToken}`;
      try { qrDataUrl = await generateQrDataUrl(verifyUrl); } catch (_) { /* ignore */ }
    }
    const doc = generateCertificatePdf({
      studentName,
      levelName: cert.levelName,
      certificateNumber: cert.certificateNumber,
      issuedAt: cert.issuedAt,
      template,
      qrDataUrl
    });
    doc.save(`Certificate_${cert.certificateNumber}.pdf`);
  };

  if (loading) return <LoadingState label="Loading certificates..." />;

  const issued = certs.filter((c) => c.status === "ISSUED");
  const revoked = certs.filter((c) => c.status === "REVOKED");

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>🏆 My Certificates</h2>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
          Certificates awarded for completing course levels.
        </div>
      </div>

      {error ? <div className="card" style={{ color: "#ef4444" }}>{error}</div> : null}

      {issued.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          {issued.map((c) => (
            <CertificateCard key={c.id} cert={c} studentName={studentName} template={template} onPrint={handlePrint} onDownloadPdf={handleDownloadPdf} />
          ))}
        </div>
      ) : null}

      {revoked.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, color: "var(--color-text-muted)", fontSize: 14 }}>Revoked Certificates</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
            {revoked.map((c) => (
              <CertificateCard key={c.id} cert={c} studentName={studentName} template={template} onPrint={handlePrint} onDownloadPdf={handleDownloadPdf} />
            ))}
          </div>
        </div>
      ) : null}

      {!certs.length && !error ? (
        <div className="card muted" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
          <div style={{ fontWeight: 700 }}>No certificates yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Complete course levels to earn certificates!
          </div>
        </div>
      ) : null}

      <div ref={printRef} />
    </section>
  );
}

export { StudentCertificatesPage };
