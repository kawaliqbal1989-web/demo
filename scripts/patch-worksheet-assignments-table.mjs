import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'WorksheetAssignment'"
  );

  const count = Number(rows?.[0]?.c || 0);
  if (count > 0) {
    console.log("WorksheetAssignment table already exists; nothing to do.");
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`WorksheetAssignment\` (
      \`tenantId\` VARCHAR(191) NOT NULL,
      \`worksheetId\` VARCHAR(191) NOT NULL,
      \`studentId\` VARCHAR(191) NOT NULL,
      \`createdByUserId\` VARCHAR(191) NOT NULL,
      \`assignedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`unassignedAt\` DATETIME(3) NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,

      PRIMARY KEY (\`worksheetId\`, \`studentId\`),
      INDEX \`WorksheetAssignment_tenantId_studentId_assignedAt_idx\` (\`tenantId\`, \`studentId\`, \`assignedAt\`),
      INDEX \`WorksheetAssignment_tenantId_worksheetId_idx\` (\`tenantId\`, \`worksheetId\`),

      CONSTRAINT \`WorksheetAssignment_tenantId_fkey\`
        FOREIGN KEY (\`tenantId\`) REFERENCES \`Tenant\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT \`WorksheetAssignment_worksheetId_fkey\`
        FOREIGN KEY (\`worksheetId\`) REFERENCES \`Worksheet\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`WorksheetAssignment_studentId_fkey\`
        FOREIGN KEY (\`studentId\`) REFERENCES \`Student\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT \`WorksheetAssignment_createdByUserId_fkey\`
        FOREIGN KEY (\`createdByUserId\`) REFERENCES \`AuthUser\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log("WorksheetAssignment table created.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
