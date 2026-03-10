import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe("SHOW TABLES");
  console.log(JSON.stringify({ tables: rows }, null, 2));
} finally {
  await prisma.$disconnect();
}
