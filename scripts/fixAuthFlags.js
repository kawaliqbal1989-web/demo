import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  const username = process.argv[2] || 'BP005';
  const user = await prisma.authUser.findFirst({ where: { username } });
  if(!user){
    console.error('User not found');
    process.exit(1);
  }
  const updated = await prisma.authUser.update({ where: { id: user.id }, data: { mustChangePassword: false, failedAttempts: 0, lockUntil: null, isActive: true } });
  console.log('Updated:', JSON.stringify({ id: updated.id, username: updated.username, mustChangePassword: updated.mustChangePassword, failedAttempts: updated.failedAttempts }, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
