import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = "http://localhost:4000/api";
const tenantCode = "DEFAULT";
const password = "Pass@123";

async function login(username) {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenantCode, username, password })
  });

  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    body,
    token: body?.data?.access_token ?? null
  };
}

async function listCatalogCourses(token) {
  const response = await fetch(`${base}/catalog/courses?limit=200&offset=0&status=ACTIVE`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    count: Array.isArray(body?.data?.items) ? body.data.items.length : null,
    body
  };
}

async function expectedForRole({ role, username }) {
  const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode }, select: { id: true } });
  if (!tenant) {
    return { expected: null, note: "tenant not found" };
  }

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

    const selectiveCount = await prisma.partnerCourseAccess.count({
      where: {
        businessPartnerId: bp.id,
        course: { tenantId: tenant.id, isActive: true }
      }
    });

    return { expected: selectiveCount, note: "selective" };
  }

  if (role === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: {
        tenantId: tenant.id,
        authUser: { username }
      },
      select: {
        businessPartner: { select: { id: true, accessMode: true } }
      }
    });

    const bp = profile?.businessPartner;
    if (!bp) {
      return { expected: 0, note: "franchise->bp missing" };
    }

    if (bp.accessMode !== "SELECTIVE") {
      return { expected: totalActive, note: `via bp accessMode=${bp.accessMode}` };
    }

    const selectiveCount = await prisma.partnerCourseAccess.count({
      where: {
        businessPartnerId: bp.id,
        course: { tenantId: tenant.id, isActive: true }
      }
    });

    return { expected: selectiveCount, note: "via bp selective" };
  }

  if (role === "CENTER") {
    const profile = await prisma.centerProfile.findFirst({
      where: {
        tenantId: tenant.id,
        authUser: { username }
      },
      select: {
        franchiseProfile: {
          select: {
            businessPartner: { select: { id: true, accessMode: true } }
          }
        }
      }
    });

    const bp = profile?.franchiseProfile?.businessPartner;
    if (!bp) {
      return { expected: 0, note: "center->bp missing" };
    }

    if (bp.accessMode !== "SELECTIVE") {
      return { expected: totalActive, note: `via bp accessMode=${bp.accessMode}` };
    }

    const selectiveCount = await prisma.partnerCourseAccess.count({
      where: {
        businessPartnerId: bp.id,
        course: { tenantId: tenant.id, isActive: true }
      }
    });

    return { expected: selectiveCount, note: "via bp selective" };
  }

  return { expected: null, note: "unsupported role" };
}

async function main() {
  const cli = process.argv.slice(2);
  const users = cli.length >= 3
    ? [
        { role: "BP", username: cli[0] },
        { role: "FRANCHISE", username: cli[1] },
        { role: "CENTER", username: cli[2] }
      ]
    : [
        { role: "BP", username: "BP001" },
        { role: "FRANCHISE", username: "FR001" },
        { role: "CENTER", username: "CE001" }
      ];

  const results = [];

  for (const user of users) {
    const auth = await login(user.username);
    if (!auth.ok || !auth.token) {
      results.push({
        role: user.role,
        username: user.username,
        loginStatus: auth.status,
        catalogStatus: null,
        apiCount: null,
        expected: null,
        match: false,
        note: auth.body?.error_code ?? auth.body?.message ?? "login failed"
      });
      continue;
    }

    const api = await listCatalogCourses(auth.token);
    const expected = await expectedForRole(user);

    results.push({
      role: user.role,
      username: user.username,
      loginStatus: auth.status,
      catalogStatus: api.status,
      apiCount: api.count,
      expected: expected.expected,
      match: api.count === expected.expected,
      note: expected.note
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
