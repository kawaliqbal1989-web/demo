import dotenv from 'dotenv';
dotenv.config();
import { createPrismaClient } from '../src/lib/prisma-client.js';

const prisma = createPrismaClient();

async function main() {
  const username = process.argv[2] || 'BP005';
  const user = await prisma.authUser.findFirst({ where: { username } });
  console.log(user ? JSON.stringify(user, null, 2) : `AuthUser ${username} not found`);
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
