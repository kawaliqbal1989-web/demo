import { prisma } from "./src/lib/prisma.js";
const rows = await prisma.$queryRaw`SHOW TABLES`;
console.log(JSON.stringify(rows, null, 2));
