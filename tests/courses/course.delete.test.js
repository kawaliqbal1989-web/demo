import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("COURSE DELETE", () => {
  let superadminToken;
  let tenant;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;
    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  });

  test("deletes an unused course and its course levels", async () => {
    const suffix = randomId("course_delete");
    const course = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        code: `DEL_${suffix}`,
        name: `Delete ${suffix}`,
        description: "delete test",
        isActive: true
      }
    });

    await prisma.courseLevel.createMany({
      data: [
        {
          tenantId: tenant.id,
          courseId: course.id,
          levelNumber: 1,
          title: "Level 1",
          sortOrder: 1,
          isActive: true
        },
        {
          tenantId: tenant.id,
          courseId: course.id,
          levelNumber: 2,
          title: "Level 2",
          sortOrder: 2,
          isActive: true
        }
      ]
    });

    const response = await http.delete(`/api/courses/${course.id}`).set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Course deleted");

    const deletedCourse = await prisma.course.findUnique({ where: { id: course.id } });
    const remainingLevels = await prisma.courseLevel.count({ where: { courseId: course.id } });

    expect(deletedCourse).toBeNull();
    expect(remainingLevels).toBe(0);
  });

  test("blocks delete when the course is still assigned to students", async () => {
    const suffix = randomId("course_block");
    const course = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        code: `BLK_${suffix}`,
        name: `Blocked ${suffix}`,
        description: "blocked delete test",
        isActive: true
      }
    });

    const level = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
    const school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `DELSTU_${suffix}`,
        firstName: "Delete",
        lastName: "Blocked",
        hierarchyNodeId: school.id,
        levelId: level.id,
        courseId: course.id,
        isActive: true
      }
    });

    const response = await http.delete(`/api/courses/${course.id}`).set(authHeader(superadminToken));

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("COURSE_DELETE_BLOCKED");

    const stillThere = await prisma.course.findUnique({ where: { id: course.id } });
    expect(stillThere).not.toBeNull();

    await prisma.student.delete({ where: { id: student.id } });
    await prisma.course.delete({ where: { id: course.id } });
  });
});