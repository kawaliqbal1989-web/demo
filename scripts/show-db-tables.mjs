import { createPrismaClient } from "../src/lib/prisma-client.js";

const prisma = createPrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe("SHOW TABLES");
  console.log(JSON.stringify({ tables: rows }, null, 2));
} finally {
  await prisma.$disconnect();
}
