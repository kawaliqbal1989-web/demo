import { PrismaClient } from "@prisma/client";
import { listCatalogCourses } from "../src/controllers/catalog.controller.js";

const prisma = new PrismaClient();

function makeRes(onDone) {
  return {
    statusCode: null,
    payload: null,
    apiSuccess(message, data) {
      this.statusCode = 200;
      this.payload = { message, data };
      if (typeof onDone === "function") {
        onDone();
      }
      return this.payload;
    },
    apiError(status, message, errorCode) {
      this.statusCode = status;
      this.payload = { message, errorCode };
      if (typeof onDone === "function") {
        onDone();
      }
      return this.payload;
    }
  };
}

async function runForUser({ username, role }) {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  if (!tenant) {
    return { username, role, status: 500, count: null, error: "tenant_not_found" };
  }

  const user = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username, role, isActive: true },
    select: { id: true, tenantId: true, role: true }
  });

  if (!user) {
    return { username, role, status: 404, count: null, error: "user_not_found" };
  }

  const req = {
    auth: {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role
    },
    query: {
      limit: "200",
      offset: "0",
      status: "ACTIVE"
    }
  };

  const res = await new Promise((resolve, reject) => {
    const response = makeRes(() => resolve(response));
    listCatalogCourses(req, response, (err) => {
      if (err) {
        reject(err);
      }
    });
  });

  return {
    username,
    role,
    status: res.statusCode,
    count: Array.isArray(res.payload?.data?.items) ? res.payload.data.items.length : null,
    error: res.payload?.errorCode ?? null
  };
}

async function expectedForUser({ username, role }) {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  const totalActive = await prisma.course.count({ where: { tenantId: tenant.id, isActive: true } });

  if (role === "BP") {
    const bp = await prisma.businessPartner.findUnique({
      where: { tenantId_code: { tenantId: tenant.id, code: username } },
      select: { id: true, accessMode: true }
    });

    if (!bp) {
      return { expected: 0, note: "bp missing" };
    }

    if (bp.accessMode !== "SELECTIVE") {
      return { expected: totalActive, note: `accessMode=${bp.accessMode}` };
    }

    const assigned = await prisma.partnerCourseAccess.count({
      where: { businessPartnerId: bp.id, course: { tenantId: tenant.id, isActive: true } }
    });

    return { expected: assigned, note: "selective" };
  }

  if (role === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: { tenantId: tenant.id, authUser: { username } },
      select: { businessPartner: { select: { id: true, accessMode: true } } }
    });

    const bp = profile?.businessPartner;
    if (!bp) {
      return { expected: 0, note: "franchise->bp missing" };
    }

    if (bp.accessMode !== "SELECTIVE") {
      return { expected: totalActive, note: `via bp accessMode=${bp.accessMode}` };
    }

    const assigned = await prisma.partnerCourseAccess.count({
      where: { businessPartnerId: bp.id, course: { tenantId: tenant.id, isActive: true } }
    });

    return { expected: assigned, note: "via bp selective" };
  }

  if (role === "CENTER") {
    const profile = await prisma.centerProfile.findFirst({
      where: { tenantId: tenant.id, authUser: { username } },
      select: {
        franchiseProfile: { select: { businessPartner: { select: { id: true, accessMode: true } } } }
      }
    });

    const bp = profile?.franchiseProfile?.businessPartner;
    if (!bp) {
      return { expected: 0, note: "center->bp missing" };
    }

    if (bp.accessMode !== "SELECTIVE") {
      return { expected: totalActive, note: `via bp accessMode=${bp.accessMode}` };
    }

    const assigned = await prisma.partnerCourseAccess.count({
      where: { businessPartnerId: bp.id, course: { tenantId: tenant.id, isActive: true } }
    });

    return { expected: assigned, note: "via bp selective" };
  }

  return { expected: null, note: "unsupported role" };
}

async function main() {
  const args = process.argv.slice(2);
  const users = args.length >= 3
    ? [
        { role: "BP", username: args[0] },
        { role: "FRANCHISE", username: args[1] },
        { role: "CENTER", username: args[2] }
      ]
    : [
        { role: "BP", username: "BP014" },
        { role: "FRANCHISE", username: "FR006" },
        { role: "CENTER", username: "CE004" }
      ];

  const result = [];
  for (const user of users) {
    const actual = await runForUser(user);
    const expected = await expectedForUser(user);

    result.push({
      role: user.role,
      username: user.username,
      status: actual.status,
      apiCount: actual.count,
      expected: expected.expected,
      match: actual.count === expected.expected,
      note: expected.note,
      error: actual.error
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
