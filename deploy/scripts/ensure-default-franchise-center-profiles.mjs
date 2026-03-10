import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  if (!tenant) {
    throw new Error("Tenant DEFAULT not found");
  }

  const bp = await prisma.businessPartner.findFirst({
    where: { tenantId: tenant.id, code: "BP-001", isActive: true },
    select: { id: true, code: true, name: true }
  });
  if (!bp) {
    throw new Error("BusinessPartner BP-001 not found (run seed or create partner)");
  }

  const franchiseAuth = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username: "FR001", role: "FRANCHISE", isActive: true },
    select: { id: true, username: true }
  });
  if (!franchiseAuth) {
    throw new Error("AuthUser FR001 (FRANCHISE) not found");
  }

  const centerAuth = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username: "CE001", role: "CENTER", isActive: true },
    select: { id: true, username: true }
  });
  if (!centerAuth) {
    throw new Error("AuthUser CE001 (CENTER) not found");
  }

  const franchiseProfile = await prisma.franchiseProfile.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "FR-001"
      }
    },
    update: {
      businessPartnerId: bp.id,
      authUserId: franchiseAuth.id,
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      businessPartnerId: bp.id,
      authUserId: franchiseAuth.id,
      code: "FR-001",
      name: "Default Franchise",
      displayName: "Default Franchise",
      status: "ACTIVE",
      isActive: true
    },
    select: { id: true, code: true, businessPartnerId: true }
  });

  const centerProfile = await prisma.centerProfile.upsert({
    where: { authUserId: centerAuth.id },
    update: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      code: "CE-001",
      name: "Default Center",
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      authUserId: centerAuth.id,
      code: "CE-001",
      name: "Default Center",
      displayName: "Default Center",
      status: "ACTIVE",
      isActive: true
    },
    select: { id: true, code: true, franchiseProfileId: true, authUserId: true }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId: tenant.id,
        businessPartner: bp,
        franchiseProfile,
        centerProfile
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
