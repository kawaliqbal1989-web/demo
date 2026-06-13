import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  if (!tenant) throw new Error("DEFAULT tenant not found");

  const centerUser = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, role: "CENTER", isActive: true },
    select: { id: true, username: true }
  });
  if (!centerUser) throw new Error("No active CENTER user found");

  const hash = await bcrypt.hash("Pass@123", 12);
  await prisma.authUser.update({ where: { id: centerUser.id }, data: { passwordHash: hash, mustChangePassword: false } });

  console.log(JSON.stringify({ updatedCenterUser: centerUser.username, password: "Pass@123" }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
