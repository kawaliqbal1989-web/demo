import { asyncHandler } from "../utils/async-handler.js";
import { resolveBusinessPartnerBrandingForAuth } from "../services/branding.service.js";
import { prisma } from "../lib/prisma.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";
import { versionAssetUrl } from "../utils/request-url.js";

function serializeBrandingCertificateTemplate({ template, businessPartner }) {
  const templateVersion = template?.updatedAt || null;

  if (!businessPartner?.id && !template) {
    return null;
  }

  return {
    title: template?.title || "Certificate of Achievement",
    signatoryName: template?.signatoryName ?? null,
    signatoryDesignation: template?.signatoryDesignation ?? null,
    signatureImageUrl: versionAssetUrl(template?.signatureImageUrl, templateVersion) || null,
    affiliationLogoUrl: versionAssetUrl(template?.affiliationLogoUrl, templateVersion) || null,
    stampImageUrl: versionAssetUrl(template?.stampImageUrl, templateVersion) || null,
    backgroundImageUrl: versionAssetUrl(template?.backgroundImageUrl, templateVersion) || null,
    bpLogoUrl: businessPartner?.logoUrl || null,
    layout: template?.layout || null,
    updatedAt: template?.updatedAt || null
  };
}

const getMyBranding = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
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
          layout: true,
          updatedAt: true
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
    certificateTemplate: serializeBrandingCertificateTemplate({ template: certificateTemplate, businessPartner })
  });
});

export { getMyBranding };
