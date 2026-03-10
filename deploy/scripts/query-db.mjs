import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });
const competitions = await prisma.competition.findMany({
  select: { id: true, title: true, tenantId: true, workflowStage: true }
});

console.log(JSON.stringify({ tenants, competitionsCount: competitions.length, competitions }, null, 2));

await prisma.$disconnect();
