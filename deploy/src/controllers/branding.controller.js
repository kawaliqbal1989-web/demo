import { asyncHandler } from "../utils/async-handler.js";
import { resolveBusinessPartnerBrandingForAuth } from "../services/branding.service.js";
import { prisma } from "../lib/prisma.js";

const getMyBranding = asyncHandler(async (req, res) => {
  const businessPartner = await resolveBusinessPartnerBrandingForAuth({ auth: req.auth });

  let certificateTemplate = null;
  if (businessPartner?.id) {
    certificateTemplate = await prisma.certificateTemplate.findUnique({
      where: { businessPartnerId: businessPartner.id },
      select: {
        title: true,
        signatoryName: true,
        signatoryDesignation: true,
        signatureImageUrl: true,
        affiliationLogoUrl: true,
        stampImageUrl: true,
        backgroundImageUrl: true,
        layout: true
      }
    });
  }

  return res.apiSuccess("Branding fetched", {
    businessPartner,
    certificateTemplate
  });
});

export { getMyBranding };
