import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = 'http://127.0.0.1:4000/api';

async function req(path, init = {}) {
  const r = await fetch(base + path, init);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, ok: r.ok, path, bodyText: text, bodyJson: json };
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { code: 'DEFAULT' }, select: { id: true } });
  if (!tenant) throw new Error('DEFAULT tenant not found');

  const centerUser = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, role: 'CENTER', username: 'CE001', isActive: true },
    select: { id: true, username: true, hierarchyNodeId: true }
  });
  if (!centerUser?.hierarchyNodeId) throw new Error('CE001 center user not found or no hierarchy node');

  const student = await prisma.student.findFirst({
    where: { tenantId: tenant.id, hierarchyNodeId: centerUser.hierarchyNodeId, isActive: true },
    select: { id: true, admissionNo: true }
  });
  if (!student) throw new Error('No student found in center scope');

  const login = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantCode: 'DEFAULT', username: centerUser.username, password: 'Pass@123' })
  });
  if (!login.ok) {
    console.log(JSON.stringify({ step: 'login_failed', login }, null, 2));
    process.exit(1);
  }

  const token = login.bodyJson?.data?.access_token;
  const profile360 = await req(`/center/students/${student.id}/360`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log(JSON.stringify({
    centerUsername: centerUser.username,
    studentId: student.id,
    admissionNo: student.admissionNo,
    student360: {
      status: profile360.status,
      ok: profile360.ok,
      path: profile360.path,
      message: profile360.bodyJson?.message || null,
      hasStudentBlock: Boolean(profile360.bodyJson?.data?.student)
    }
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(99); }).finally(async () => { await prisma.$disconnect(); });
