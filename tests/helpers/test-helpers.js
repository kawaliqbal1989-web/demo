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
  password = "Pass@123"
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

  return prisma.authUser.upsert({
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
      studentId
    }
  });
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
