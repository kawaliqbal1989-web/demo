import { prisma } from "../lib/prisma.js";
import { isFeatureEnabled } from "./feature-flags.service.js";

function isCompetitionFoundationEnabled() {
  return isFeatureEnabled("competition-v2-foundation");
}

async function listCompetitionFoundationTemplates({ tenantId, includeInactive = false } = {}) {
  const where = { tenantId };
  if (!includeInactive) {
    where.isActive = true;
  }

  return prisma.competitionTemplate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

async function createCompetitionFoundationTemplate({ tenantId, name, slug, description, isActive = true } = {}) {
  return prisma.competitionTemplate.create({
    data: {
      tenantId,
      name,
      slug,
      description,
      isActive
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

async function listCompetitionFoundationSeasons({ tenantId, includeInactive = false } = {}) {
  const where = { tenantId };
  if (!includeInactive) {
    where.isActive = true;
  }

  return prisma.competitionSeason.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      startDate: true,
      endDate: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

async function createCompetitionFoundationSeason({ tenantId, name, slug, startDate, endDate, isActive = true } = {}) {
  return prisma.competitionSeason.create({
    data: {
      tenantId,
      name,
      slug,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      isActive
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      startDate: true,
      endDate: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export {
  isCompetitionFoundationEnabled,
  listCompetitionFoundationTemplates,
  createCompetitionFoundationTemplate,
  listCompetitionFoundationSeasons,
  createCompetitionFoundationSeason
};
