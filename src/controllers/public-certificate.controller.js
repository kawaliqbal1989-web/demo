import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { versionAssetUrl } from "../utils/request-url.js";

function readCertificateBrandingSnapshot(cert) {
  let metadata = null;
  try {
    metadata = typeof cert?.metadata === "string" ? JSON.parse(cert.metadata) : cert?.metadata;
  } catch {
    metadata = null;
  }
  return cert?.brandingSnapshot || metadata?.brandingSnapshot || null;
}

function formatStudentName(student) {
  return [student?.firstName, student?.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ") || null;
}

const verifyCertificate = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { token } = req.params;

  if (!token || typeof token !== "string" || token.length > 100) {
    return res.apiError(400, "Invalid verification token", "VALIDATION_ERROR");
  }

  const cert = await prisma.certificate.findUnique({
    where: { verificationToken: token },
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      levelSnapshot: true,
      brandingSnapshot: true,
      competitionSnapshot: true,
      resultSnapshot: true,
      metadata: true,
      student: {
        select: { firstName: true, lastName: true }
      },
      level: {
        select: { name: true }
      },
      tenant: {
        select: {
          name: true,
          businessPartners: {
            take: 1,
            select: {
              name: true,
              logoUrl: true,
              updatedAt: true
            }
          }
        }
      }
    }
  });

  if (!cert) {
    return res.apiError(404, "Certificate not found", "CERTIFICATE_NOT_FOUND");
  }

  const brandingSnapshot = readCertificateBrandingSnapshot(cert);
  let metadata = null;
  try {
    metadata = typeof cert.metadata === "string" ? JSON.parse(cert.metadata) : cert.metadata;
  } catch {
    metadata = null;
  }
  const levelSnapshot = cert.levelSnapshot || metadata?.academicSnapshot?.level || null;

  return res.apiSuccess("Certificate verified", {
    certificateNumber: cert.certificateNumber,
    status: cert.status,
    studentName: formatStudentName(cert.student),
    levelName: levelSnapshot?.name || cert.level.name,
    issuedAt: cert.issuedAt,
    revokedAt: cert.revokedAt,
    organizationName: brandingSnapshot?.organizationName || cert.tenant?.businessPartners?.[0]?.name || cert.tenant?.name || null,
    organizationLogoUrl: brandingSnapshot?.organizationLogoUrl || versionAssetUrl(
      cert.tenant?.businessPartners?.[0]?.logoUrl,
      cert.tenant?.businessPartners?.[0]?.updatedAt
    ) || null,
    brandingSnapshot,
    competition: cert.competitionSnapshot || metadata?.competitionSnapshot || null,
    result: cert.resultSnapshot || metadata?.resultSnapshot || null
  });
});

export { verifyCertificate };
