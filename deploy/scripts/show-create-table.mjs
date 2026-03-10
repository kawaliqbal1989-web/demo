import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const table = process.argv[2] || "AuthUser";

try {
  const rows = await prisma.$queryRawUnsafe(`SHOW CREATE TABLE \`${table}\``);
  console.log(JSON.stringify({ table, rows }, null, 2));
} finally {
  await prisma.$disconnect();
}
