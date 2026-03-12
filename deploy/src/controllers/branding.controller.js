import { asyncHandler } from "../utils/async-handler.js";
import { resolveBusinessPartnerBrandingForAuth } from "../services/branding.service.js";
import { prisma } from "../lib/prisma.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

const getMyBranding = asyncHandler(async (req, res) => {
  let businessPartner = null;
  try {
    businessPartner = await resolveBusinessPartnerBrandingForAuth({ auth: req.auth });
  } catch (error) {
    if (!isSchemaMismatchError(error, ["businesspartner", "franchiseprofile", "centerprofile"])) {
      throw error;
    }
  }

  let certificateTemplate = null;
  if (businessPartner?.id) {
    try {
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
    } catch (error) {
      if (!isSchemaMismatchError(error, ["certificatetemplate"])) {
        throw error;
      }
    }
  }

  return res.apiSuccess("Branding fetched", {
    businessPartner,
    certificateTemplate
  });
});

export { getMyBranding };
