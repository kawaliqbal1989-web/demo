import { verifyAccessToken } from "../utils/token.js";
import { sendError } from "../utils/api-response.js";
import { prisma } from "../lib/prisma.js";

async function isHierarchyPathActive({ tenantId, hierarchyNodeId }) {
  if (!hierarchyNodeId) {
    return true;
  }

  let currentId = hierarchyNodeId;
  let safety = 0;

  while (currentId && safety < 50) {
    // eslint-disable-next-line no-await-in-loop
    const node = await prisma.hierarchyNode.findFirst({
      where: {
        tenantId,
        id: currentId
      },
      select: {
        id: true,
        parentId: true,
        isActive: true
      }
    });

    if (!node || !node.isActive) {
      return false;
    }

    currentId = node.parentId || null;
    safety += 1;
  }

  return !currentId;
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "Missing or invalid authorization header", "AUTH_REQUIRED");
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.authUser.findFirst({
      where: {
        id: payload.userId,
        tenantId: payload.tenantId,
        isActive: true
      },
      select: {
        id: true,
        tenantId: true,
        hierarchyNodeId: true
      }
    });

    if (!user) {
      return sendError(res, 401, "Account is inactive", "ACCOUNT_INACTIVE");
    }

    const hierarchyActive = await isHierarchyPathActive({
      tenantId: user.tenantId,
      hierarchyNodeId: user.hierarchyNodeId
    });

    if (!hierarchyActive) {
      return sendError(res, 401, "Account is inactive", "ACCOUNT_INACTIVE");
    }

    req.auth = {
      userId: payload.userId,
      role: payload.role,
      tenantId: payload.tenantId,
      hierarchyNodeId: payload.hierarchyNodeId || null,
      studentId: payload.studentId || null,
      username: payload.username || null
    };
    return next();
  } catch (_error) {
    return sendError(res, 401, "Unauthorized", "INVALID_ACCESS_TOKEN");
  }
}

export { authenticate };
