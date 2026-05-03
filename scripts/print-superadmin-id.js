import { createPrismaClient } from '../src/lib/prisma-client.js';

const prisma = createPrismaClient();
async function main(){
  const u = await prisma.authUser.findUnique({ where: { tenantId_email: { tenantId: 'tenant_default', email: 'superadmin@abacusweb.local' }}});
  console.log(u);
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e); prisma.$disconnect(); process.exit(1)});
