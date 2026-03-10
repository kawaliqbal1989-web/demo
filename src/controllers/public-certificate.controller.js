import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const verifyCertificate = asyncHandler(async (req, res) => {
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
      student: {
        select: { fullName: true }
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
              logoUrl: true
            }
          }
        }
      }
    }
  });

  if (!cert) {
    return res.apiError(404, "Certificate not found", "CERTIFICATE_NOT_FOUND");
  }

  return res.apiSuccess("Certificate verified", {
    certificateNumber: cert.certificateNumber,
    status: cert.status,
    studentName: cert.student.fullName,
    levelName: cert.level.name,
    issuedAt: cert.issuedAt,
    revokedAt: cert.revokedAt,
    organizationName: cert.tenant?.businessPartners?.[0]?.name || cert.tenant?.name || null,
    organizationLogoUrl: cert.tenant?.businessPartners?.[0]?.logoUrl || null
  });
});

export { verifyCertificate };
