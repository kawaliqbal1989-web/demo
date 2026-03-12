import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  tokenHash,
  verifyRefreshToken
} from "../utils/token.js";
import { recordAudit } from "../utils/audit.js";
import { getRoleCapabilities } from "../utils/capabilities.js";

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

async function isRoleScopeActive({ user }) {
  if (!user) {
    return false;
  }

  if (user.role === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId: user.tenantId,
        authUserId: user.id
      },
      select: {
        isActive: true,
        status: true
      }
    });

    if (!profile || !profile.isActive || profile.status !== "ACTIVE") {
      return false;
    }
  }

  if (user.role === "CENTER") {
    const profile = await prisma.centerProfile.findFirst({
      where: {
        tenantId: user.tenantId,
        authUserId: user.id
      },
      select: {
        isActive: true,
        status: true
      }
    });

    if (!profile || !profile.isActive || profile.status !== "ACTIVE") {
      return false;
    }
  }

  if (user.role === "TEACHER") {
    const profile = await prisma.teacherProfile.findFirst({
      where: {
        tenantId: user.tenantId,
        authUserId: user.id
      },
      select: {
        isActive: true,
        status: true
      }
    });

    if (!profile || !profile.isActive || profile.status !== "ACTIVE") {
      return false;
    }
  }

  if (user.role === "STUDENT") {
    if (!user.studentId) {
      return false;
    }

    const student = await prisma.student.findFirst({
      where: {
        tenantId: user.tenantId,
        id: user.studentId
      },
      select: {
        isActive: true,
        hierarchyNodeId: true
      }
    });

    if (!student || !student.isActive) {
      return false;
    }

    const studentHierarchyActive = await isHierarchyPathActive({
      tenantId: user.tenantId,
      hierarchyNodeId: student.hierarchyNodeId
    });

    if (!studentHierarchyActive) {
      return false;
    }
  }

  if (user.role === "BP") {
    const criteria = [];

    if (user.hierarchyNodeId) {
      criteria.push({ hierarchyNodeId: user.hierarchyNodeId });
    }

    if (user.username) {
      criteria.push({ code: String(user.username).trim() });
    }

    if (user.email) {
      criteria.push({ contactEmail: String(user.email).trim().toLowerCase() });
    }

    if (criteria.length) {
      const partner = await prisma.businessPartner.findFirst({
        where: {
          tenantId: user.tenantId,
          OR: criteria
        },
        orderBy: { createdAt: "desc" },
        select: {
          isActive: true,
          status: true,
          hierarchyNodeId: true
        }
      });

      if (partner && (!partner.isActive || partner.status !== "ACTIVE")) {
        return false;
      }

      if (partner?.hierarchyNodeId) {
        const partnerHierarchyActive = await isHierarchyPathActive({
          tenantId: user.tenantId,
          hierarchyNodeId: partner.hierarchyNodeId
        });

        if (!partnerHierarchyActive) {
          return false;
        }
      }
    }
  }

  const hierarchyActive = await isHierarchyPathActive({
    tenantId: user.tenantId,
    hierarchyNodeId: user.hierarchyNodeId
  });

  return hierarchyActive;
}

async function canAuthenticateUser(user) {
  if (!user || !user.isActive) {
    return false;
  }

  return isRoleScopeActive({ user });
}

const login = asyncHandler(async (req, res) => {
  const { tenantCode = "DEFAULT", username, password } = req.body;

  const tenant = await prisma.tenant.findUnique({
    where: { code: tenantCode },
    select: { id: true, code: true }
  });

  if (!tenant || !username || !password) {
    await recordAudit({
      tenantId: tenant?.id || "tenant_default",
      action: "LOGIN_ATTEMPT",
      entityType: "AUTH",
      metadata: { username, tenantCode, success: false, reason: "invalid_credentials_input" }
    });

    return res.apiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  const user = await prisma.authUser.findFirst({
    where: {
      tenantId: tenant.id,
      username
    },
    select: {
      id: true,
      username: true,
      role: true,
      tenantId: true,
      isActive: true,
      mustChangePassword: true,
      passwordHash: true,
      failedAttempts: true,
      lockUntil: true,
      hierarchyNodeId: true,
      studentId: true
    }
  });

  const userAllowed = await canAuthenticateUser(user);

  if (!userAllowed) {
    await recordAudit({
      tenantId: tenant.id,
      userId: user?.id,
      role: user?.role,
      action: "LOGIN_ATTEMPT",
      entityType: "AUTH",
      metadata: { username, tenantCode, success: false, reason: "user_not_found_or_inactive_scope" }
    });

    return res.apiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    return res.apiError(423, "Account temporarily locked", "ACCOUNT_LOCKED");
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    const nextAttempts = user.failedAttempts + 1;
    const lockUntil = nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await prisma.authUser.update({
      where: { id: user.id },
      data: {
        failedAttempts: nextAttempts >= 5 ? 0 : nextAttempts,
        lockUntil
      }
    });

    await recordAudit({
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
      action: "LOGIN_ATTEMPT",
      entityType: "AUTH",
      metadata: {
        username,
        tenantCode,
        success: false,
        reason: nextAttempts >= 5 ? "account_locked" : "password_mismatch"
      }
    });

    return nextAttempts >= 5
      ? res.apiError(423, "Account temporarily locked", "ACCOUNT_LOCKED")
      : res.apiError(401, "Invalid credentials", "INVALID_CREDENTIALS");
  }

  await prisma.authUser.update({
    where: { id: user.id },
    data: {
      failedAttempts: 0,
      lockUntil: null
    }
  });

  const payload = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
    hierarchyNodeId: user.hierarchyNodeId,
    studentId: user.studentId,
    username: user.username
  };

  const accessToken = signAccessToken(payload);
  const refresh = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      tokenId: refresh.tokenId,
      tokenHash: tokenHash(refresh.token),
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt: refresh.expiresAt,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || null
    }
  });

  await recordAudit({
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
    action: "LOGIN_ATTEMPT",
    entityType: "AUTH",
    metadata: { username, tenantCode, success: true }
  });

  return res.apiSuccess("Login successful", {
    access_token: accessToken,
    refresh_token: refresh.token,
    expires_in: "20m",
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenant_id: user.tenantId,
      hierarchy_node_id: user.hierarchyNodeId,
      must_change_password: user.mustChangePassword,
      capabilities: getRoleCapabilities(user.role)
    }
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await prisma.authUser.findFirst({
    where: {
      id: req.auth.userId,
      tenantId: req.auth.tenantId,
      isActive: true
    },
    select: {
      id: true,
      username: true,
      role: true,
      tenantId: true,
      hierarchyNodeId: true,
      mustChangePassword: true
    }
  });

  if (!user) {
    return res.apiError(404, "User not found", "USER_NOT_FOUND");
  }

  return res.apiSuccess("Session loaded", {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      tenant_id: user.tenantId,
      hierarchy_node_id: user.hierarchyNodeId,
      must_change_password: user.mustChangePassword,
      capabilities: getRoleCapabilities(user.role)
    }
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.apiError(400, "currentPassword and newPassword are required", "VALIDATION_ERROR");
  }

  if (String(newPassword).length < 8) {
    return res.apiError(400, "Password must be at least 8 characters", "VALIDATION_ERROR");
  }

  const user = await prisma.authUser.findFirst({
    where: {
      id: req.auth.userId,
      tenantId: req.auth.tenantId,
      isActive: true
    },
    select: {
      id: true,
      tenantId: true,
      passwordHash: true
    }
  });

  if (!user) {
    return res.apiError(404, "User not found", "USER_NOT_FOUND");
  }

  const validCurrent = await verifyPassword(currentPassword, user.passwordHash);
  if (!validCurrent) {
    return res.apiError(401, "Invalid current password", "INVALID_CURRENT_PASSWORD");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.authUser.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      failedAttempts: 0,
      lockUntil: null
    }
  });

  await prisma.refreshToken.updateMany({
    where: {
      userId: user.id,
      tenantId: user.tenantId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });

  return res.apiSuccess("Password changed successfully", null);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { targetUserId, newPassword, mustChangePassword = true } = req.body;

  if (!targetUserId || !newPassword) {
    return res.apiError(400, "targetUserId and newPassword are required", "VALIDATION_ERROR");
  }

  if (String(newPassword).length < 8) {
    return res.apiError(400, "Password must be at least 8 characters", "VALIDATION_ERROR");
  }

  const target = req.targetUser;
  if (!target || target.id !== targetUserId) {
    return res.apiError(404, "Target user not found", "TARGET_USER_NOT_FOUND");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.authUser.update({
    where: { id: targetUserId },
    data: {
      passwordHash,
      mustChangePassword: Boolean(mustChangePassword),
      failedAttempts: 0,
      lockUntil: null
    }
  });

  await prisma.refreshToken.updateMany({
    where: {
      userId: targetUserId,
      tenantId: req.auth.tenantId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "PASSWORD_RESET",
    entityType: "AUTH_USER",
    entityId: targetUserId,
    metadata: {
      by: req.auth.userId,
      mustChangePassword: Boolean(mustChangePassword)
    }
  });

  return res.apiSuccess("Password reset successful", null);
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.apiError(400, "refreshToken is required", "REFRESH_TOKEN_REQUIRED");
  }

  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (_error) {
    return res.apiError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
  }

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenId: payload.tokenId },
    include: { user: true }
  });

  if (existing?.revokedAt && existing.tokenHash === tokenHash(refreshToken)) {
    await prisma.refreshToken.updateMany({
      where: {
        userId: existing.userId,
        tenantId: existing.tenantId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    await recordAudit({
      tenantId: existing.tenantId,
      userId: existing.userId,
      role: existing.user?.role || null,
      action: "REFRESH_TOKEN_REUSE_DETECTED",
      entityType: "AUTH",
      entityId: existing.id,
      metadata: {
        tokenId: existing.tokenId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null
      }
    });

    return res.apiError(401, "Refresh token reuse detected", "REFRESH_TOKEN_REUSED");
  }

  if (
    !existing ||
    existing.revokedAt ||
    existing.expiresAt < new Date() ||
    existing.tokenHash !== tokenHash(refreshToken)
  ) {
    return res.apiError(401, "Refresh token invalid or expired", "REFRESH_TOKEN_INVALID");
  }

  const refreshUserAllowed = await canAuthenticateUser(existing.user);
  if (!refreshUserAllowed) {
    await prisma.refreshToken.updateMany({
      where: {
        userId: existing.userId,
        tenantId: existing.tenantId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });

    return res.apiError(401, "Account is inactive", "ACCOUNT_INACTIVE");
  }

  const nextPayload = {
    userId: existing.user.id,
    role: existing.user.role,
    tenantId: existing.user.tenantId,
    hierarchyNodeId: existing.user.hierarchyNodeId,
    studentId: existing.user.studentId,
    username: existing.user.username
  };

  const accessToken = signAccessToken(nextPayload);
  const nextRefresh = signRefreshToken(nextPayload);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: nextRefresh.tokenId
      }
    }),
    prisma.refreshToken.create({
      data: {
        tokenId: nextRefresh.tokenId,
        tokenHash: tokenHash(nextRefresh.token),
        userId: existing.user.id,
        tenantId: existing.user.tenantId,
        expiresAt: nextRefresh.expiresAt,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null
      }
    })
  ]);

  return res.apiSuccess("Token refreshed", {
    access_token: accessToken,
    refresh_token: nextRefresh.token,
    expires_in: "20m"
  });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: {
          tokenId: payload.tokenId,
          userId: req.auth.userId,
          tenantId: req.auth.tenantId,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
    } catch (_error) {
      return res.apiError(400, "Provided refresh token is invalid", "INVALID_REFRESH_TOKEN");
    }
  } else {
    await prisma.refreshToken.updateMany({
      where: {
        userId: req.auth.userId,
        tenantId: req.auth.tenantId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "LOGOUT",
    entityType: "AUTH"
  });

  return res.apiSuccess("Logout successful", null);
});

export { login, me, refresh, logout, changePassword, resetPassword };
