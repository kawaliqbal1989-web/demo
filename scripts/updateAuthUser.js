import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const prisma = new PrismaClient();
async function main(){
  const id = process.argv[2];
  const newUsername = process.argv[3];
  const newPassword = process.argv[4];
  if(!id || !newUsername || !newPassword){
    console.error('Usage: node updateAuthUser.js <userId> <newUsername> <newPassword>');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await prisma.authUser.update({ where: { id }, data: { username: newUsername, passwordHash, mustChangePassword: false } });
  console.log('Updated:', JSON.stringify({ id: updated.id, username: updated.username, email: updated.email }, null, 2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
