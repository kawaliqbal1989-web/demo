import { asyncHandler } from "../utils/async-handler.js";
import { createCompetitionFoundationSeason, createCompetitionFoundationTemplate, isCompetitionFoundationEnabled, listCompetitionFoundationSeasons, listCompetitionFoundationTemplates } from "../services/competition-foundation.service.js";
import { recordAudit } from "../utils/audit.js";

const listFoundationTemplates = asyncHandler(async (req, res) => {
  if (!isCompetitionFoundationEnabled()) {
    return res.apiError(404, "Competition foundation is not enabled", "FEATURE_DISABLED");
  }

  const items = await listCompetitionFoundationTemplates({ tenantId: req.auth.tenantId });
  return res.apiSuccess("Competition foundation templates fetched", items);
});

const createFoundationTemplate = asyncHandler(async (req, res) => {
  if (!isCompetitionFoundationEnabled()) {
    return res.apiError(404, "Competition foundation is not enabled", "FEATURE_DISABLED");
  }

  const { name, slug, description, isActive } = req.body || {};
  const trimmedName = String(name || "").trim();
  const trimmedSlug = String(slug || "").trim();

  if (!trimmedName || !trimmedSlug) {
    return res.apiError(400, "name and slug are required", "VALIDATION_ERROR");
  }

  const template = await createCompetitionFoundationTemplate({
    tenantId: req.auth.tenantId,
    name: trimmedName,
    slug: trimmedSlug,
    description: description ? String(description).trim() : null,
    isActive: isActive !== false
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_TEMPLATE_CREATED",
    entityType: "COMPETITION_TEMPLATE",
    entityId: template.id,
    metadata: { slug: trimmedSlug }
  });

  return res.apiSuccess("Competition foundation template created", template, 201);
});

const listFoundationSeasons = asyncHandler(async (req, res) => {
  if (!isCompetitionFoundationEnabled()) {
    return res.apiError(404, "Competition foundation is not enabled", "FEATURE_DISABLED");
  }

  const items = await listCompetitionFoundationSeasons({ tenantId: req.auth.tenantId });
  return res.apiSuccess("Competition foundation seasons fetched", items);
});

const createFoundationSeason = asyncHandler(async (req, res) => {
  if (!isCompetitionFoundationEnabled()) {
    return res.apiError(404, "Competition foundation is not enabled", "FEATURE_DISABLED");
  }

  const { name, slug, startDate, endDate, isActive } = req.body || {};
  const trimmedName = String(name || "").trim();
  const trimmedSlug = String(slug || "").trim();

  if (!trimmedName || !trimmedSlug) {
    return res.apiError(400, "name and slug are required", "VALIDATION_ERROR");
  }

  const season = await createCompetitionFoundationSeason({
    tenantId: req.auth.tenantId,
    name: trimmedName,
    slug: trimmedSlug,
    startDate,
    endDate,
    isActive: isActive !== false
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_SEASON_CREATED",
    entityType: "COMPETITION_SEASON",
    entityId: season.id,
    metadata: { slug: trimmedSlug }
  });

  return res.apiSuccess("Competition foundation season created", season, 201);
});

export {
  listFoundationTemplates,
  createFoundationTemplate,
  listFoundationSeasons,
  createFoundationSeason
};
