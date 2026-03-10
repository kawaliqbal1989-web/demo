import { prisma } from "../lib/prisma.js";
import { sendError } from "../utils/api-response.js";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isWriteRequest(req) {
  return writeMethods.has(String(req.method || "").toUpperCase());
}

function resolveGraceUntil(partner) {
  return partner.gracePeriodUntil || partner.subscriptionExpiresAt || null;
}

async function resolveBpUser({ tenantId, userId }) {
  let currentUserId = userId;
  let safety = 0;

  while (currentUserId && safety < 6) {
    // eslint-disable-next-line no-await-in-loop
    const user = await prisma.authUser.findFirst({
      where: {
        id: currentUserId,
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        role: true,
        email: true,
        hierarchyNodeId: true,
        parentUserId: true
      }
    });

    if (!user) {
      return null;
    }

    if (user.role === "BP") {
      return user;
    }

    if (user.role === "SUPERADMIN") {
      return null;
    }

    currentUserId = user.parentUserId || null;
    safety += 1;
  }

  return null;
}

async function resolveBusinessPartner({ tenantId, bpUser }) {
  if (!bpUser) {
    return null;
  }

  const partner = await prisma.businessPartner.findFirst({
    where: {
      tenantId,
      OR: [
        bpUser.email ? { contactEmail: bpUser.email } : undefined,
        bpUser.hierarchyNodeId ? { hierarchyNodeId: bpUser.hierarchyNodeId } : undefined
      ].filter(Boolean)
    },
    select: {
      id: true,
      tenantId: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
      gracePeriodUntil: true
    }
  });

  return partner || null;
}

function shouldAutoExpire(partner, now) {
  if (partner.subscriptionStatus !== "ACTIVE") {
    return false;
  }

  if (!partner.subscriptionExpiresAt) {
    return false;
  }

  return new Date(partner.subscriptionExpiresAt).getTime() < now.getTime();
}

function shouldBlock(partner, req, now) {
  if (!isWriteRequest(req)) {
    return false;
  }

  if (partner.subscriptionStatus === "SUSPENDED") {
    return true;
  }

  if (partner.subscriptionStatus !== "EXPIRED") {
    return false;
  }

  const graceUntil = resolveGraceUntil(partner);
  if (!graceUntil) {
    return true;
  }

  return now.getTime() > new Date(graceUntil).getTime();
}

function enforceSubscription() {
  return async function enforceSubscriptionMiddleware(req, res, next) {
    try {
      const role = req.auth?.role;

      if (!role) {
        return next();
      }

      if (role === "SUPERADMIN") {
        return next();
      }

      // Only operational roles are subscription-gated.
      if (![["BP"], ["FRANCHISE"], ["CENTER"], ["TEACHER"]].some(([r]) => r === role)) {
        return next();
      }

      const tenantId = req.auth?.tenantId;
      const userId = req.auth?.userId;

      if (!tenantId || !userId) {
        return next();
      }

      const bpUser = await resolveBpUser({ tenantId, userId });
      const partner = await resolveBusinessPartner({ tenantId, bpUser });

      if (!partner) {
        return next();
      }

      const now = new Date();

      if (shouldAutoExpire(partner, now)) {
        await prisma.businessPartner.update({
          where: { id: partner.id },
          data: {
            subscriptionStatus: "EXPIRED"
          }
        });

        partner.subscriptionStatus = "EXPIRED";
      }

      if (shouldBlock(partner, req, now)) {
        return sendError(res, 402, "Subscription expired", "SUBSCRIPTION_EXPIRED");
      }

      return next();
    } catch (_error) {
      return next();
    }
  };
}

export { enforceSubscription };