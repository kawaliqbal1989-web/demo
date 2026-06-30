import { prisma } from "../lib/prisma.js";
import { createBulkNotification } from "./notification.service.js";
import { resolveBusinessPartnerForUser } from "./bp-scope.service.js";

const COMPETITION_NOTIFICATION_TYPE = "COMPETITION_STAGE_UPDATE";
const COMPETITION_ENTITY_TYPE = "COMPETITION";

const competitionDeepLinkByRole = {
  TEACHER: (competitionId) => `/teacher/competitions/${competitionId}`,
  CENTER: (competitionId) => `/center/competitions/${competitionId}`,
  FRANCHISE: (competitionId) => `/franchise/competitions/${competitionId}`,
  BP: (competitionId) => `/bp/competitions/${competitionId}`,
  SUPERADMIN: (competitionId) => `/superadmin/competition/${competitionId}`
};

function dedupeRecipients(users = []) {
  const seen = new Set();
  const recipients = [];

  for (const user of users) {
    if (!user?.id || seen.has(user.id)) {
      continue;
    }
    seen.add(user.id);
    recipients.push(user);
  }

  return recipients;
}

function actorLabel(user, fallback) {
  return user?.centerProfile?.displayName
    || user?.centerProfile?.name
    || user?.franchiseProfile?.displayName
    || user?.franchiseProfile?.name
    || user?.username
    || user?.email
    || fallback;
}

async function getCompetition({ tenantId, competitionId, db = prisma }) {
  return db.competition.findFirst({
    where: { id: competitionId, tenantId },
    select: {
      id: true,
      title: true,
      hierarchyNodeId: true,
      businessPartnerMappings: {
        select: {
          businessPartnerId: true,
          businessPartner: {
            select: {
              id: true,
              code: true,
              name: true,
              contactEmail: true,
              hierarchyNodeId: true
            }
          }
        }
      }
    }
  });
}

async function getActorUser({ tenantId, actorUserId, db = prisma }) {
  if (!actorUserId) {
    return null;
  }

  return db.authUser.findFirst({
    where: { id: actorUserId, tenantId },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      hierarchyNodeId: true,
      centerProfile: {
        select: {
          id: true,
          name: true,
          displayName: true,
          franchiseProfile: {
            select: {
              id: true,
              authUserId: true,
              businessPartnerId: true,
              name: true,
              displayName: true
            }
          }
        }
      },
      franchiseProfile: {
        select: {
          id: true,
          name: true,
          displayName: true,
          businessPartnerId: true
        }
      }
    }
  });
}

async function findUsersByRole({ tenantId, roles, db = prisma, where = {} }) {
  return db.authUser.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: roles },
      ...where
    },
    select: { id: true, role: true },
    take: 1000
  });
}

async function findBusinessPartnerUsers({ tenantId, businessPartners = [], db = prisma }) {
  const partnerFilters = businessPartners
    .filter(Boolean)
    .map((partner) => ({
      OR: [
        partner.code ? { username: partner.code } : null,
        partner.contactEmail ? { email: partner.contactEmail } : null,
        partner.hierarchyNodeId ? { hierarchyNodeId: partner.hierarchyNodeId } : null
      ].filter(Boolean)
    }))
    .filter((filter) => filter.OR.length);

  if (!partnerFilters.length) {
    return [];
  }

  return db.authUser.findMany({
    where: {
      tenantId,
      isActive: true,
      role: "BP",
      OR: partnerFilters
    },
    select: { id: true, role: true },
    take: 1000
  });
}

async function findFranchiseUsersForBusinessPartners({ tenantId, businessPartnerIds = [], db = prisma }) {
  if (!businessPartnerIds.length) {
    return [];
  }

  const franchises = await db.franchiseProfile.findMany({
    where: {
      tenantId,
      isActive: true,
      status: { not: "ARCHIVED" },
      businessPartnerId: { in: businessPartnerIds }
    },
    select: {
      authUser: { select: { id: true, role: true } }
    },
    take: 1000
  });

  return franchises.map((item) => item.authUser).filter(Boolean);
}

async function findCenterUsersForBusinessPartners({ tenantId, businessPartnerIds = [], db = prisma }) {
  if (!businessPartnerIds.length) {
    return [];
  }

  const centers = await db.centerProfile.findMany({
    where: {
      tenantId,
      isActive: true,
      status: { not: "ARCHIVED" },
      franchiseProfile: {
        is: {
          businessPartnerId: { in: businessPartnerIds }
        }
      }
    },
    select: {
      authUser: { select: { id: true, role: true } }
    },
    take: 1000
  });

  return centers.map((item) => item.authUser).filter(Boolean);
}

async function findTeacherUsersForBusinessPartners({ tenantId, businessPartnerIds = [], db = prisma }) {
  if (!businessPartnerIds.length) {
    return [];
  }

  const centers = await db.centerProfile.findMany({
    where: {
      tenantId,
      isActive: true,
      status: { not: "ARCHIVED" },
      franchiseProfile: {
        is: {
          businessPartnerId: { in: businessPartnerIds }
        }
      }
    },
    select: { authUser: { select: { hierarchyNodeId: true } } },
    take: 1000
  });

  const nodeIds = Array.from(new Set(centers.map((item) => item.authUser?.hierarchyNodeId).filter(Boolean)));
  if (!nodeIds.length) {
    return [];
  }

  return findUsersByRole({
    tenantId,
    roles: ["TEACHER"],
    db,
    where: { hierarchyNodeId: { in: nodeIds } }
  });
}

async function findCompetitionAudience({ tenantId, competition, roles, db = prisma }) {
  const mappedBusinessPartners = (competition?.businessPartnerMappings || [])
    .map((mapping) => mapping.businessPartner)
    .filter(Boolean);
  const businessPartnerIds = mappedBusinessPartners.map((partner) => partner.id).filter(Boolean);

  if (!businessPartnerIds.length) {
    return findUsersByRole({ tenantId, roles, db });
  }

  const lookups = [];
  if (roles.includes("BP")) {
    lookups.push(findBusinessPartnerUsers({ tenantId, businessPartners: mappedBusinessPartners, db }));
  }
  if (roles.includes("FRANCHISE")) {
    lookups.push(findFranchiseUsersForBusinessPartners({ tenantId, businessPartnerIds, db }));
  }
  if (roles.includes("CENTER")) {
    lookups.push(findCenterUsersForBusinessPartners({ tenantId, businessPartnerIds, db }));
  }
  if (roles.includes("TEACHER")) {
    lookups.push(findTeacherUsersForBusinessPartners({ tenantId, businessPartnerIds, db }));
  }

  const groups = await Promise.all(lookups);
  const recipients = dedupeRecipients(groups.flat());
  return recipients.length ? recipients : findUsersByRole({ tenantId, roles, db });
}

async function notifyCompetitionUsers({ tenantId, competition, recipients, title, message, priority = "NORMAL", db = prisma }) {
  const deduped = dedupeRecipients(recipients);
  if (!competition?.id || !deduped.length) {
    return { count: 0 };
  }

  return createBulkNotification(
    deduped.map((recipient) => ({
      tenantId,
      recipientUserId: recipient.id,
      type: COMPETITION_NOTIFICATION_TYPE,
      priority,
      category: "WORKFLOW",
      title,
      message,
      entityType: COMPETITION_ENTITY_TYPE,
      entityId: competition.id,
      actionUrl: competitionDeepLinkByRole[recipient.role]?.(competition.id) || `/competitions/${competition.id}`
    })),
    db
  );
}

async function notifyCompetitionCreated({ tenantId, competitionId, actorRole, db = prisma }) {
  if (actorRole !== "SUPERADMIN") {
    return { count: 0 };
  }

  const competition = await getCompetition({ tenantId, competitionId, db });
  const recipients = await findUsersByRole({
    tenantId,
    roles: ["BP", "FRANCHISE", "CENTER", "TEACHER"],
    db
  });

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients,
    title: "New Competition Announced",
    message: `A new competition "${competition?.title || "Competition"}" has been announced.\n\nEnrollment is now open.`,
    db
  });
}

async function notifyCenterSubmittedCompetitionRegistration({ tenantId, competitionId, actorUserId, db = prisma }) {
  const [competition, actor] = await Promise.all([
    getCompetition({ tenantId, competitionId, db }),
    getActorUser({ tenantId, actorUserId, db })
  ]);
  const franchiseUserId = actor?.centerProfile?.franchiseProfile?.authUserId;

  if (!franchiseUserId) {
    return { count: 0 };
  }

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients: [{ id: franchiseUserId, role: "FRANCHISE" }],
    title: "Center Submitted Competition Registration",
    message: `${actorLabel(actor, "Center")} submitted registrations for ${competition?.title || "Competition"}.`,
    db
  });
}

async function notifyCenterRequestedCompetitionUnlock({ tenantId, competitionId, actorUserId, db = prisma }) {
  const [competition, actor] = await Promise.all([
    getCompetition({ tenantId, competitionId, db }),
    getActorUser({ tenantId, actorUserId, db })
  ]);
  const franchiseUserId = actor?.centerProfile?.franchiseProfile?.authUserId;

  if (!franchiseUserId) {
    return { count: 0 };
  }

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients: [{ id: franchiseUserId, role: "FRANCHISE" }],
    title: "Center Requested Unlock",
    message: `${actorLabel(actor, "Center")} requested registration reopening.`,
    db
  });
}

async function notifyFranchiseSubmittedCompetitionRegistration({ tenantId, competitionId, actorUserId, db = prisma }) {
  const [competition, actor] = await Promise.all([
    getCompetition({ tenantId, competitionId, db }),
    getActorUser({ tenantId, actorUserId, db })
  ]);
  const businessPartner = actor?.franchiseProfile?.businessPartnerId
    ? await db.businessPartner.findFirst({
        where: { id: actor.franchiseProfile.businessPartnerId, tenantId, isActive: true },
        select: { id: true, code: true, name: true, contactEmail: true, hierarchyNodeId: true }
      })
    : null;
  const recipients = await findBusinessPartnerUsers({ tenantId, businessPartners: [businessPartner], db });

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients,
    title: "Franchise Submitted Competition Registration",
    message: `${actorLabel(actor, "Franchise")} submitted registrations for ${competition?.title || "Competition"}.`,
    db
  });
}

async function notifyBusinessPartnerSubmittedCompetitionRegistration({ tenantId, competitionId, actorUserId, db = prisma }) {
  const [competition, businessPartner] = await Promise.all([
    getCompetition({ tenantId, competitionId, db }),
    resolveBusinessPartnerForUser({ tenantId, userId: actorUserId, tx: db })
  ]);
  const recipients = await findUsersByRole({ tenantId, roles: ["SUPERADMIN"], db });

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients,
    title: "Business Partner Submitted Competition Registration",
    message: `${businessPartner?.name || "Business Partner"} submitted registrations for ${competition?.title || "Competition"}.`,
    db
  });
}

async function notifyCompetitionApproved({ tenantId, competitionId, db = prisma }) {
  const competition = await getCompetition({ tenantId, competitionId, db });
  const recipients = await findCompetitionAudience({
    tenantId,
    competition,
    roles: ["BP", "FRANCHISE", "CENTER", "TEACHER"],
    db
  });

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients,
    title: "Competition Registrations Approved",
    message: "Competition registrations have been approved.\n\nQuestion Paper Mapping will begin.",
    priority: "HIGH",
    db
  });
}

async function notifyCompetitionRejected({ tenantId, competitionId, reason, db = prisma }) {
  const competition = await getCompetition({ tenantId, competitionId, db });
  const recipients = await findCompetitionAudience({
    tenantId,
    competition,
    roles: ["BP", "FRANCHISE", "CENTER"],
    db
  });
  const normalizedReason = String(reason || "").trim();

  return notifyCompetitionUsers({
    tenantId,
    competition,
    recipients,
    title: "Competition Registrations Rejected",
    message: `Competition registrations for ${competition?.title || "Competition"} were rejected.${normalizedReason ? ` Reason: ${normalizedReason}` : ""}`,
    priority: "HIGH",
    db
  });
}

async function notifyCompetitionForwarded({ tenantId, competitionId, actorUserId, actorRole, toStage, db = prisma }) {
  if (actorRole === "CENTER" && toStage === "FRANCHISE_REVIEW") {
    return notifyCenterSubmittedCompetitionRegistration({ tenantId, competitionId, actorUserId, db });
  }
  if (actorRole === "FRANCHISE" && toStage === "BP_REVIEW") {
    return notifyFranchiseSubmittedCompetitionRegistration({ tenantId, competitionId, actorUserId, db });
  }
  if (actorRole === "BP" && toStage === "SUPERADMIN_APPROVAL") {
    return notifyBusinessPartnerSubmittedCompetitionRegistration({ tenantId, competitionId, actorUserId, db });
  }
  if (actorRole === "SUPERADMIN" && toStage === "APPROVED") {
    return notifyCompetitionApproved({ tenantId, competitionId, db });
  }

  return { count: 0 };
}

export {
  notifyCenterRequestedCompetitionUnlock,
  notifyCompetitionCreated,
  notifyCompetitionForwarded,
  notifyCompetitionRejected,
  notifyCenterSubmittedCompetitionRegistration
};
