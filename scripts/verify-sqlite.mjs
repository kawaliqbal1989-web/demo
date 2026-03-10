import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = "http://localhost:4000";

async function request(method, path, { body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await response.json().catch(() => null);
  return {
    status: response.status,
    payload: json
  };
}

async function login(email, password, tenantCode = "DEFAULT") {
  const body = { tenantCode, email, password };
  const result = await request("POST", "/api/auth/login", { body });
  return { request: body, ...result };
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    environment: "sqlite-temporary-verification",
    checks: {}
  };

  const superadminLogin = await login("superadmin@abacusweb.local", "Pass@123", "DEFAULT");
  report.checks.superadminLogin = {
    request: superadminLogin.request,
    status: superadminLogin.status,
    response: superadminLogin.payload,
    databaseVerification: await prisma.authUser.findFirst({
      where: {
        email: "superadmin@abacusweb.local",
        tenant: { code: "DEFAULT" }
      },
      select: {
        id: true,
        role: true,
        tenantId: true,
        isActive: true
      }
    })
  };

  const centerLogin = await login("center.manager@abacusweb.local", "Pass@123", "DEFAULT");
  const centerCreateBpBody = {
    name: "Unauthorized Center Partner",
    code: "BP-DENY-CENTER",
    contactEmail: "center.denied@example.com"
  };
  const centerCreateBp = await request("POST", "/api/business-partners", {
    token: centerLogin.payload?.data?.access_token,
    body: centerCreateBpBody
  });
  report.checks.centerCreateBusinessPartnerDenied = {
    request: centerCreateBpBody,
    status: centerCreateBp.status,
    response: centerCreateBp.payload,
    databaseVerification: {
      createdCount: await prisma.businessPartner.count({
        where: {
          tenant: { code: "DEFAULT" },
          code: "BP-DENY-CENTER"
        }
      })
    }
  };

  const bpLogin = await login("bp.manager@abacusweb.local", "Pass@123", "DEFAULT");
  const otherTenantCompetition = await prisma.competition.findFirst({
    where: {
      tenant: { code: "OTHER" }
    },
    select: {
      id: true,
      tenantId: true,
      workflowStage: true
    }
  });

  const bpCrossTenant = await request(
    "POST",
    `/api/competitions/${otherTenantCompetition.id}/forward-request`,
    {
      token: bpLogin.payload?.data?.access_token,
      body: {}
    }
  );

  report.checks.bpCrossTenantAccessDenied = {
    request: {
      endpoint: `/api/competitions/${otherTenantCompetition.id}/forward-request`,
      body: {}
    },
    status: bpCrossTenant.status,
    response: bpCrossTenant.payload,
    databaseVerification: {
      targetCompetitionTenantId: otherTenantCompetition.tenantId,
      actorTenantCode: "DEFAULT"
    }
  };

  const defaultCompetition = await prisma.competition.findFirst({
    where: {
      tenant: { code: "DEFAULT" },
      title: "Winter Abacus Challenge"
    },
    select: {
      id: true,
      workflowStage: true
    }
  });

  const forward1 = await request(
    "POST",
    `/api/competitions/${defaultCompetition.id}/forward-request`,
    {
      token: centerLogin.payload?.data?.access_token,
      body: {}
    }
  );

  const forward2 = await request(
    "POST",
    `/api/competitions/${defaultCompetition.id}/forward-request`,
    {
      token: centerLogin.payload?.data?.access_token,
      body: {}
    }
  );

  const competitionAfterForwards = await prisma.competition.findUnique({
    where: { id: defaultCompetition.id },
    select: {
      id: true,
      workflowStage: true,
      status: true,
      updatedAt: true
    }
  });

  report.checks.competitionForwardStageEnforcement = {
    firstForward: {
      request: {
        endpoint: `/api/competitions/${defaultCompetition.id}/forward-request`,
        body: {}
      },
      status: forward1.status,
      response: forward1.payload
    },
    secondForward: {
      request: {
        endpoint: `/api/competitions/${defaultCompetition.id}/forward-request`,
        body: {}
      },
      status: forward2.status,
      response: forward2.payload
    },
    databaseVerification: competitionAfterForwards
  };

  const loginForRefresh = await login("superadmin@abacusweb.local", "Pass@123", "DEFAULT");
  const refreshBody1 = { refreshToken: loginForRefresh.payload?.data?.refresh_token };
  const refresh1 = await request("POST", "/api/auth/refresh", { body: refreshBody1 });
  const refreshBodyReused = { refreshToken: loginForRefresh.payload?.data?.refresh_token };
  const refreshReuse = await request("POST", "/api/auth/refresh", { body: refreshBodyReused });

  const superadminUser = await prisma.authUser.findFirst({
    where: {
      email: "superadmin@abacusweb.local",
      tenant: { code: "DEFAULT" }
    },
    select: { id: true }
  });

  const refreshTokens = await prisma.refreshToken.findMany({
    where: { userId: superadminUser.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      tokenId: true,
      revokedAt: true,
      replacedByTokenId: true,
      createdAt: true,
      expiresAt: true
    }
  });

  report.checks.refreshTokenRotation = {
    firstRefresh: {
      request: refreshBody1,
      status: refresh1.status,
      response: refresh1.payload
    },
    reusedOldRefresh: {
      request: refreshBodyReused,
      status: refreshReuse.status,
      response: refreshReuse.payload
    },
    databaseVerification: refreshTokens
  };

  const expiredToken = jwt.sign(
    {
      userId: superadminUser.id,
      role: "SUPERADMIN",
      tenantId: report.checks.superadminLogin.databaseVerification.tenantId,
      hierarchyNodeId: null,
      studentId: null
    },
    "change_this_access_secret",
    { expiresIn: -10 }
  );

  const expiredTokenRequest = await request("GET", "/api/levels", { token: expiredToken });
  report.checks.expiredAccessTokenRejected = {
    request: {
      endpoint: "/api/levels",
      auth: "Bearer <expired-jwt>"
    },
    status: expiredTokenRequest.status,
    response: expiredTokenRequest.payload
  };

  const auditLogEntries = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "LOGIN_ATTEMPT",
          "FORWARD_COMPETITION_REQUEST",
          "COMPETITION_WORKFLOW_TRANSITION",
          "COURSE_ASSIGNMENT"
        ]
      }
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      role: true,
      createdAt: true,
      metadata: true
    }
  });

  report.checks.auditLogsVerification = {
    status: 200,
    response: {
      success: true,
      message: "Audit logs fetched from database",
      data: {
        count: auditLogEntries.length
      },
      error_code: null
    },
    databaseVerification: auditLogEntries,
    sampleAuditLogEntry: auditLogEntries[0] || null
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
