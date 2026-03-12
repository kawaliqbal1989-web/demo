require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const bps = await p.businessPartner.findMany({ select: { id: true, accessMode: true, name: true }, take: 5 });
    console.log('Business Partners:', JSON.stringify(bps, null, 2));

    const pas = await p.partnerCourseAccess.findMany({ take: 10, select: { id: true, businessPartnerId: true, courseId: true } });
    console.log('Partner Course Access entries:', pas.length, JSON.stringify(pas, null, 2));

    const centers = await p.centerProfile.findMany({
      take: 3,
      select: {
        id: true,
        authUserId: true,
        name: true,
        franchiseProfileId: true,
        franchiseProfile: {
          select: {
            id: true,
            businessPartnerId: true,
            businessPartner: { select: { id: true, accessMode: true, name: true } }
          }
        }
      }
    });
    console.log('Centers:', JSON.stringify(centers, null, 2));

    // Check courses
    const courseCount = await p.course.count();
    const courses = await p.course.findMany({ take: 5, select: { id: true, code: true, name: true, isActive: true, tenantId: true } });
    console.log('Total courses:', courseCount);
    console.log('Courses:', JSON.stringify(courses, null, 2));

    // Check levels
    const levelCount = await p.level.count();
    console.log('Total levels:', levelCount);

    // Check courseLevels
    const clCount = await p.courseLevel.count();
    console.log('Total courseLevels:', clCount);

    // Check worksheets
    const wsCount = await p.worksheet.count();
    console.log('Total worksheets:', wsCount);

    // Check tenants
    const tenants = await p.tenant.findMany({ select: { id: true, name: true } });
    console.log('Tenants:', JSON.stringify(tenants, null, 2));

    // Check center user's hierarchyNode
    const centerAuth = await p.authUser.findMany({
      where: { role: 'CENTER' },
      take: 3,
      select: { id: true, email: true, role: true, hierarchyNodeId: true, tenantId: true }
    });
    console.log('Center auth users:', JSON.stringify(centerAuth, null, 2));
  } catch (e) {
    console.error(e.message);
  } finally {
    await p.$disconnect();
  }
})();
