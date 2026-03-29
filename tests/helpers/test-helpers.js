import bcrypt from "bcrypt";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

const http = request(app);

function randomId(prefix = "t") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function authHeader(token) {
  return {
    Authorization: `Bearer ${token}`
  };
}

function deriveDisplayName({ username, email, role }) {
  if (username) {
    return username;
  }

  if (email) {
    return String(email).split("@")[0];
  }

  return role;
}

async function ensureBusinessPartnerForTenant({ tenantId, user, hierarchyNodeId }) {
  const existing = await prisma.businessPartner.findFirst({
    where: {
      tenantId,
      isActive: true,
      status: "ACTIVE"
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return prisma.businessPartner.create({
    data: {
      tenantId,
      name: `${deriveDisplayName(user)} Partner`,
      code: `BP-${randomId("helper")}`,
      displayName: `${deriveDisplayName(user)} Partner`,
      status: "ACTIVE",
      isActive: true,
      contactEmail: user.email,
      hierarchyNodeId,
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt: null,
      gracePeriodUntil: null,
      createdByUserId: user.id
    },
    select: { id: true }
  });
}

async function ensureFranchiseProfileForTenant({ tenantId, user, hierarchyNodeId }) {
  const existing = await prisma.franchiseProfile.findFirst({
    where: {
      tenantId,
      isActive: true,
      status: "ACTIVE"
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  const partner = await ensureBusinessPartnerForTenant({ tenantId, user, hierarchyNodeId });

  return prisma.franchiseProfile.create({
    data: {
      tenantId,
      businessPartnerId: partner.id,
      authUserId: user.id,
      code: `FR-${randomId("helper")}`,
      name: `${deriveDisplayName(user)} Franchise`,
      displayName: `${deriveDisplayName(user)} Franchise`,
      status: "ACTIVE",
      isActive: true
    },
    select: { id: true }
  });
}

async function ensureRoleScope({ tenantId, user, hierarchyNodeId }) {
  if (user.role === "TEACHER") {
    if (!hierarchyNodeId) {
      return;
    }

    await prisma.teacherProfile.upsert({
      where: { authUserId: user.id },
      update: {
        tenantId,
        hierarchyNodeId,
        fullName: deriveDisplayName(user),
        status: "ACTIVE",
        isActive: true
      },
      create: {
        tenantId,
        hierarchyNodeId,
        authUserId: user.id,
        fullName: deriveDisplayName(user),
        status: "ACTIVE",
        isActive: true
      }
    });
    return;
  }

  if (user.role === "FRANCHISE") {
    const partner = await ensureBusinessPartnerForTenant({ tenantId, user, hierarchyNodeId });

    await prisma.franchiseProfile.upsert({
      where: { authUserId: user.id },
      update: {
        tenantId,
        businessPartnerId: partner.id,
        code: `FR-${user.username}`,
        name: deriveDisplayName(user),
        displayName: deriveDisplayName(user),
        status: "ACTIVE",
        isActive: true
      },
      create: {
        tenantId,
        businessPartnerId: partner.id,
        authUserId: user.id,
        code: `FR-${user.username}`,
        name: deriveDisplayName(user),
        displayName: deriveDisplayName(user),
        status: "ACTIVE",
        isActive: true
      }
    });
    return;
  }

  if (user.role === "CENTER") {
    const franchise = await ensureFranchiseProfileForTenant({ tenantId, user, hierarchyNodeId });

    await prisma.centerProfile.upsert({
      where: { authUserId: user.id },
      update: {
        tenantId,
        franchiseProfileId: franchise.id,
        code: `CE-${user.username}`,
        name: deriveDisplayName(user),
        displayName: deriveDisplayName(user),
        status: "ACTIVE",
        isActive: true
      },
      create: {
        tenantId,
        franchiseProfileId: franchise.id,
        authUserId: user.id,
        code: `CE-${user.username}`,
        name: deriveDisplayName(user),
        displayName: deriveDisplayName(user),
        status: "ACTIVE",
        isActive: true
      }
    });
  }
}

async function loginAs({ username, email, password = "Pass@123", tenantCode = "DEFAULT" }) {
  let resolvedUsername = username;

  if (!resolvedUsername && email) {
    const tenant = await getTenantByCode(tenantCode);
    if (tenant) {
      const user = await prisma.authUser.findFirst({
        where: {
          tenantId: tenant.id,
          email
        },
        select: {
          username: true
        }
      });
      resolvedUsername = user?.username;
    }
  }

  const response = await http.post("/api/auth/login").send({
    tenantCode,
    username: resolvedUsername,
    password
  });

  return response;
}

async function getTenantByCode(code) {
  return prisma.tenant.findUnique({
    where: { code }
  });
}

async function getHierarchyNodeByCode(tenantId, code) {
  return prisma.hierarchyNode.findUnique({
    where: {
      tenantId_code: {
        tenantId,
        code
      }
    }
  });
}

async function ensureAuthUser({
  tenantCode = "DEFAULT",
  email,
  username,
  role,
  hierarchyNodeCode,
  parentUserId = null,
  studentId = null,
  password = "Pass@123",
  mustChangePassword = false
}) {
  const tenant = await getTenantByCode(tenantCode);
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantCode}`);
  }

  let hierarchyNodeId = null;
  if (hierarchyNodeCode) {
    const node = await getHierarchyNodeByCode(tenant.id, hierarchyNodeCode);
    hierarchyNodeId = node?.id || null;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const resolvedUsername = username || `${role.slice(0, 2)}${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;

  const user = await prisma.authUser.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: email || `${resolvedUsername.toLowerCase()}@internal.local`
      }
    },
    update: {
      username: resolvedUsername,
      role,
      isActive: true,
      hierarchyNodeId,
      parentUserId,
      studentId,
      mustChangePassword,
      passwordHash
    },
    create: {
      tenantId: tenant.id,
      username: resolvedUsername,
      email: email || `${resolvedUsername.toLowerCase()}@internal.local`,
      passwordHash,
      role,
      isActive: true,
      hierarchyNodeId,
      parentUserId,
      studentId,
      mustChangePassword
    }
  });

  await ensureRoleScope({
    tenantId: tenant.id,
    user,
    hierarchyNodeId
  });

  return user;
}

async function waitFor(condition, { timeoutMs = 2000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await condition();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export {
  prisma,
  http,
  randomId,
  authHeader,
  loginAs,
  getTenantByCode,
  getHierarchyNodeByCode,
  ensureAuthUser,
  waitFor
};
