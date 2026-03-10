const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const enrollCount = await p.enrollment.count();
  console.log('Total enrollments:', enrollCount);
  if (enrollCount > 0) {
    const sample = await p.enrollment.findMany({ take: 3, select: { id: true, studentId: true, assignedTeacherUserId: true, hierarchyNodeId: true, status: true, batchId: true } });
    console.log('Sample enrollments:', JSON.stringify(sample, null, 2));
  }
  const te = await p.authUser.findFirst({ where: { username: 'TE001' }, select: { id: true, hierarchyNodeId: true } });
  console.log('TE001:', JSON.stringify(te));
  
  // Check batch teacher assignments
  const btaCount = await p.batchTeacherAssignment.count();
  console.log('Batch teacher assignments:', btaCount);
  if (btaCount > 0) {
    const btas = await p.batchTeacherAssignment.findMany({ take: 3, select: { id: true, batchId: true, teacherUserId: true } });
    console.log('BTA samples:', JSON.stringify(btas, null, 2));
  }
  
  // Check center profile for CE001
  const ce = await p.authUser.findFirst({ where: { username: 'CE001' }, select: { id: true, hierarchyNodeId: true, role: true } });
  console.log('CE001:', JSON.stringify(ce));
  if (ce) {
    const cp = await p.centerProfile.findFirst({ where: { userId: ce.id } });
    console.log('CE001 CenterProfile:', JSON.stringify(cp));
  }
  
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
