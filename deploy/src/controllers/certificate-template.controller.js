import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const getCertificateTemplate = asyncHandler(async (req, res) => {
  const businessPartnerId = req.bpScope.businessPartner.id;

  const template = await prisma.certificateTemplate.findUnique({
    where: { businessPartnerId }
  });

  return res.apiSuccess("Certificate template fetched", {
    template: template || {
      title: "Certificate of Achievement",
      signatoryName: null,
      signatoryDesignation: null,
      signatureImageUrl: null,
      affiliationLogoUrl: null,
      stampImageUrl: null,
      backgroundImageUrl: null
    }
  });
});

const upsertCertificateTemplate = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const businessPartnerId = req.bpScope.businessPartner.id;
  const { title, signatoryName, signatoryDesignation, layout } = req.body;

  const data = {};
  if (title !== undefined) data.title = String(title).trim() || "Certificate of Achievement";
  if (signatoryName !== undefined) data.signatoryName = signatoryName ? String(signatoryName).trim() : null;
  if (signatoryDesignation !== undefined) data.signatoryDesignation = signatoryDesignation ? String(signatoryDesignation).trim() : null;
  if (layout !== undefined) data.layout = layout;

  const template = await prisma.certificateTemplate.upsert({
    where: { businessPartnerId },
    create: { tenantId, businessPartnerId, ...data },
    update: data
  });

  res.locals.entityId = template.id;
  return res.apiSuccess("Certificate template updated", { template });
});

function makeUploadHandler({ fieldPath, fieldUrl, uploadSubDir }) {
  return asyncHandler(async (req, res) => {
    const tenantId = req.auth.tenantId;
    const businessPartnerId = req.bpScope.businessPartner.id;

    const file = req.file;
    if (!file) {
      return res.apiError(400, "file is required", "FILE_REQUIRED");
    }

    const url = `${req.protocol}://${req.get("host")}/uploads/${uploadSubDir}/${file.filename}`;

    const template = await prisma.certificateTemplate.upsert({
      where: { businessPartnerId },
      create: {
        tenantId,
        businessPartnerId,
        [fieldPath]: file.filename,
        [fieldUrl]: url
      },
      update: {
        [fieldPath]: file.filename,
        [fieldUrl]: url
      }
    });

    res.locals.entityId = template.id;
    return res.apiSuccess("Certificate template asset uploaded", { template });
  });
}

const uploadSignatureImage = makeUploadHandler({
  fieldPath: "signatureImagePath",
  fieldUrl: "signatureImageUrl",
  uploadSubDir: "certificate-signatures"
});

const uploadAffiliationLogo = makeUploadHandler({
  fieldPath: "affiliationLogoPath",
  fieldUrl: "affiliationLogoUrl",
  uploadSubDir: "certificate-affiliation-logos"
});

const uploadStampImage = makeUploadHandler({
  fieldPath: "stampImagePath",
  fieldUrl: "stampImageUrl",
  uploadSubDir: "certificate-stamps"
});

const uploadBackgroundImage = makeUploadHandler({
  fieldPath: "backgroundImagePath",
  fieldUrl: "backgroundImageUrl",
  uploadSubDir: "certificate-backgrounds"
});

export {
  getCertificateTemplate,
  upsertCertificateTemplate,
  uploadSignatureImage,
  uploadAffiliationLogo,
  uploadStampImage,
  uploadBackgroundImage
};
