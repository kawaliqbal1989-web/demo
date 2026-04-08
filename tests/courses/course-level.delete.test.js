import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("COURSE LEVEL DELETE", () => {
  let superadminToken;
  let tenant;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    superadminToken = superadminLogin.body.data.access_token;
    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
  });

  test("deletes a course level from a course", async () => {
    const suffix = randomId("course_level_delete");
    const course = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        code: `CLD_${suffix}`,
        name: `Course Level Delete ${suffix}`,
        description: "delete course level test",
        isActive: true
      }
    });

    const level = await prisma.courseLevel.create({
      data: {
        tenantId: tenant.id,
        courseId: course.id,
        levelNumber: 1,
        title: "Level 1",
        sortOrder: 1,
        isActive: true
      }
    });

    const response = await http
      .delete(`/api/courses/${course.id}/levels/${level.id}`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Course level deleted");

    const deleted = await prisma.courseLevel.findUnique({ where: { id: level.id } });
    const existingCourse = await prisma.course.findUnique({ where: { id: course.id } });

    expect(deleted).toBeNull();
    expect(existingCourse).not.toBeNull();

    await prisma.course.delete({ where: { id: course.id } });
  });
});