import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  "ALTER TABLE `AttendanceCorrectionRequest` ADD CONSTRAINT `AttendanceCorrectionRequest_requestedByUserId_fkey` FOREIGN KEY (`requestedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;",
  "ALTER TABLE `AttendanceCorrectionRequest` ADD CONSTRAINT `AttendanceCorrectionRequest_reviewedByUserId_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `AuthUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;"
];

try {
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(JSON.stringify({ ok: true, sql }, null, 2));
    } catch (error) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            sql,
            message: error?.message ?? String(error)
          },
          null,
          2
        )
      );
    }
  }
} finally {
  await prisma.$disconnect();
}
