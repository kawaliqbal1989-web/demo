import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../../services/apiClient";

function CertificateVerifyPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("No verification token provided.");
      setLoading(false);
      return;
    }
    apiClient
      .get(`/public/certificates/verify/${encodeURIComponent(token)}`)
      .then((res) => setData(res.data?.data))
      .catch((err) => {
        const msg = err.response?.data?.error || "Certificate not found or invalid token.";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f8fafc" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, color: "#64748b" }}>Verifying certificate...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f8fafc" }}>
        <div style={{ maxWidth: 480, padding: 32, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
          <h2 style={{ margin: "0 0 8px", color: "#dc2626" }}>Verification Failed</h2>
          <p style={{ color: "#64748b", margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  const isValid = data?.status === "ISSUED";

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f8fafc", padding: 16 }}>
      <div style={{ maxWidth: 520, width: "100%", background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        {/* Status Banner */}
        <div
          style={{
            padding: "24px 32px",
            background: isValid ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #dc2626, #ef4444)",
            color: "#fff",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 8 }}>{isValid ? "✅" : "⚠️"}</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {isValid ? "Certificate Verified" : "Certificate Revoked"}
          </h1>
          <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
            {isValid ? "This certificate is authentic and valid." : "This certificate has been revoked."}
          </div>
        </div>

        {/* Details */}
        <div style={{ padding: 32 }}>
          {data.organizationLogoUrl && (
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <img
                src={data.organizationLogoUrl}
                alt="Organization"
                style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain" }}
              />
            </div>
          )}

          {data.organizationName && (
            <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 20 }}>
              {data.organizationName}
            </div>
          )}

          <div style={{ display: "grid", gap: 16 }}>
            <DetailRow label="Student Name" value={data.studentName} />
            <DetailRow label="Level Completed" value={data.levelName} />
            <DetailRow label="Certificate Number" value={data.certificateNumber} />
            <DetailRow label="Issued Date" value={data.issuedAt ? new Date(data.issuedAt).toLocaleDateString() : "—"} />
            <DetailRow
              label="Status"
              value={
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 700,
                    background: isValid ? "#d1fae5" : "#fee2e2",
                    color: isValid ? "#065f46" : "#991b1b"
                  }}
                >
                  {data.status}
                </span>
              }
            />
            {data.revokedAt && (
              <DetailRow label="Revoked Date" value={new Date(data.revokedAt).toLocaleDateString()} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 32px", background: "#f9fafb", borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
          Certificate verification powered by AbacusWeb
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f3f4f6", paddingBottom: 8 }}>
      <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, color: "#1e293b", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export { CertificateVerifyPage };
