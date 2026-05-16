import { prisma } from "../src/lib/prisma.js";

async function main() {
  const apply = process.argv.includes("--apply");

  const franchises = await prisma.franchiseProfile.findMany({
    where: {
      businessPartnerId: { not: null }
    },
    select: {
      id: true,
      tenantId: true,
      businessPartnerId: true,
      status: true,
      onboardingDate: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });

  const rows = franchises.map((franchise) => ({
    tenantId: franchise.tenantId,
    businessPartnerId: franchise.businessPartnerId,
    franchiseId: franchise.id,
    ownershipType: "PRIMARY",
    status: franchise.status === "ARCHIVED" ? "INACTIVE" : "ACTIVE",
    activeFrom: franchise.onboardingDate || franchise.createdAt,
    activeTo: null,
    notes: "Backfilled from franchiseProfile.businessPartnerId"
  }));

  if (!apply) {
    console.log(`Dry run: ${rows.length} BusinessPartnerFranchise rows would be upserted.`);
    console.log("Run with --apply to persist changes.");
    return;
  }

  for (const row of rows) {
    await prisma.businessPartnerFranchise.upsert({
      where: {
        businessPartnerId_franchiseId: {
          businessPartnerId: row.businessPartnerId,
          franchiseId: row.franchiseId
        }
      },
      update: {
        tenantId: row.tenantId,
        ownershipType: row.ownershipType,
        status: row.status,
        notes: row.notes
      },
      create: row
    });
  }

  console.log(`Applied ${rows.length} BusinessPartnerFranchise upserts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });