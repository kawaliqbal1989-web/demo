import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
async function main(){
  const username=process.argv[2]||'BP005';
  const logs=await prisma.auditLog.findMany({where:{action:'LOGIN_ATTEMPT', tenantId:'tenant_default'}, orderBy:{createdAt:'desc'}, take:50});
  const filtered = logs.filter(l => JSON.stringify(l.metadata || '').includes(username));
  console.log(JSON.stringify(filtered.slice(0,20), null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
