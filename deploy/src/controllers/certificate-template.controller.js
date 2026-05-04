import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";
import { buildUploadUrl } from "../utils/request-url.js";

const CREATE_CERTIFICATE_TEMPLATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS \`certificatetemplate\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`tenantId\` VARCHAR(191) NOT NULL,
  \`businessPartnerId\` VARCHAR(191) NOT NULL,
  \`title\` VARCHAR(191) NOT NULL DEFAULT 'Certificate of Achievement',
  \`signatoryName\` VARCHAR(191) NULL,
  \`signatoryDesignation\` VARCHAR(191) NULL,
  \`signatureImagePath\` VARCHAR(191) NULL,
  \`signatureImageUrl\` TEXT NULL,
  \`affiliationLogoPath\` VARCHAR(191) NULL,
  \`affiliationLogoUrl\` TEXT NULL,
  \`stampImagePath\` VARCHAR(191) NULL,
  \`stampImageUrl\` TEXT NULL,
  \`backgroundImagePath\` VARCHAR(191) NULL,
  \`backgroundImageUrl\` TEXT NULL,
  \`layout\` JSON NULL,
  \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`certificatetemplate_businessPartnerId_key\` (\`businessPartnerId\`),
  KEY \`certificatetemplate_tenantId_idx\` (\`tenantId\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const selectCertificateTemplate = {
  id: true,
  title: true,
  signatoryName: true,
  signatoryDesignation: true,
  signatureImageUrl: true,
  affiliationLogoUrl: true,
  stampImageUrl: true,
  backgroundImageUrl: true,
  layout: true
};

async function ensureCertificateTemplateStorage() {
  await prisma.$executeRawUnsafe(CREATE_CERTIFICATE_TEMPLATE_TABLE_SQL);
}

async function findCertificateTemplate(businessPartnerId) {
  return prisma.certificateTemplate.findUnique({
    where: { businessPartnerId },
    select: selectCertificateTemplate
  });
}

async function saveCertificateTemplateRecord({ tenantId, businessPartnerId, data }) {
  return prisma.certificateTemplate.upsert({
    where: { businessPartnerId },
    create: { tenantId, businessPartnerId, ...data },
    update: data
  });
}

function buildDefaultCertificateTemplate() {
  return {
    title: "Certificate of Achievement",
    signatoryName: null,
    signatoryDesignation: null,
    signatureImageUrl: null,
    affiliationLogoUrl: null,
    stampImageUrl: null,
    backgroundImageUrl: null,
    layout: null,
    schemaMissing: true
  };
}

const getCertificateTemplate = asyncHandler(async (req, res) => {
  const businessPartnerId = req.bpScope.businessPartner.id;

  let template = null;
  try {
    template = await findCertificateTemplate(businessPartnerId);
  } catch (error) {
    if (!isSchemaMismatchError(error, ["certificatetemplate"])) {
      throw error;
    }

    try {
      await ensureCertificateTemplateStorage();
      template = await findCertificateTemplate(businessPartnerId);
    } catch (retryError) {
      if (!isSchemaMismatchError(retryError, ["certificatetemplate"])) {
        throw retryError;
      }
    }
  }

  return res.apiSuccess("Certificate template fetched", {
    template: template || buildDefaultCertificateTemplate()
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

  let template;
  try {
    template = await saveCertificateTemplateRecord({ tenantId, businessPartnerId, data });
  } catch (error) {
    if (!isSchemaMismatchError(error, ["certificatetemplate"])) {
      throw error;
    }

    try {
      await ensureCertificateTemplateStorage();
      template = await saveCertificateTemplateRecord({ tenantId, businessPartnerId, data });
    } catch (retryError) {
      if (!isSchemaMismatchError(retryError, ["certificatetemplate"])) {
        throw retryError;
      }
      return res.apiError(503, "Certificate template storage is unavailable until database migrations are applied", "CERTIFICATE_TEMPLATE_SCHEMA_MISSING");
    }
  }

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

    const url = buildUploadUrl(req, `/uploads/${uploadSubDir}/${file.filename}`);

    let template;
    try {
      template = await saveCertificateTemplateRecord({
        tenantId,
        businessPartnerId,
        data: {
          [fieldPath]: file.filename,
          [fieldUrl]: url
        }
      });
    } catch (error) {
      if (!isSchemaMismatchError(error, ["certificatetemplate"])) {
        throw error;
      }

      try {
        await ensureCertificateTemplateStorage();
        template = await saveCertificateTemplateRecord({
          tenantId,
          businessPartnerId,
          data: {
            [fieldPath]: file.filename,
            [fieldUrl]: url
          }
        });
      } catch (retryError) {
        if (!isSchemaMismatchError(retryError, ["certificatetemplate"])) {
          throw retryError;
        }
        return res.apiError(503, "Certificate template storage is unavailable until database migrations are applied", "CERTIFICATE_TEMPLATE_SCHEMA_MISSING");
      }
    }

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
