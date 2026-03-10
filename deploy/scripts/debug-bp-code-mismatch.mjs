import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantCode = process.env.TENANT_CODE || "DEFAULT";
  const username = process.env.BP_USERNAME || "BP001";

  const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode }, select: { id: true, code: true } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantCode}`);

  const user = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username },
    select: { id: true, username: true, role: true, hierarchyNodeId: true, email: true }
  });

  if (!user) {
    console.log(JSON.stringify({ tenant: tenant.code, username, message: "AuthUser not found" }, null, 2));
    return;
  }

  const partnerByNode = user.hierarchyNodeId
    ? await prisma.businessPartner.findFirst({
        where: { tenantId: tenant.id, hierarchyNodeId: user.hierarchyNodeId },
        select: { id: true, code: true, name: true, displayName: true, hierarchyNodeId: true }
      })
    : null;

  const partnersLike = await prisma.businessPartner.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { code: { contains: "BP" } },
        { code: { contains: "GB" } },
        { name: { contains: "North" } },
        { displayName: { contains: "North" } }
      ]
    },
    select: { id: true, code: true, name: true, displayName: true, hierarchyNodeId: true },
    take: 50,
    orderBy: { createdAt: "asc" }
  });

  console.log(
    JSON.stringify(
      {
        tenant,
        user,
        partnerByNode,
        partnersLike
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
