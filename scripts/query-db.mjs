import { createPrismaClient } from "../src/lib/prisma-client.js";

const prisma = createPrismaClient();

const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
const competitions = await prisma.competition.findMany({
  select: { id: true, title: true, tenantId: true, workflowStage: true }
});

console.log(JSON.stringify({ tenants, competitionsCount: competitions.length, competitions }, null, 2));

await prisma.$disconnect();
