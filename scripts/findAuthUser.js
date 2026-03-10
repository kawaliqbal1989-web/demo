import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] || 'BP005';
  const user = await prisma.authUser.findFirst({ where: { username } });
  console.log(user ? JSON.stringify(user, null, 2) : `AuthUser ${username} not found`);
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
