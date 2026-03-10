import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  const email = process.argv[2] || 'contact@eliteeducation.com';
  const user = await prisma.authUser.findFirst({ where: { email } });
  console.log(user ? JSON.stringify(user, null, 2) : `AuthUser with email ${email} not found`);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
