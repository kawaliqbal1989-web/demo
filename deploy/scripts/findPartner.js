import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  const code = process.argv[2] || 'BP005';
  const p = await prisma.businessPartner.findFirst({ where: { code } });
  console.log(p ? JSON.stringify(p, null, 2) : `BusinessPartner ${code} not found`);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
