import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function hasStudentCourseColumn() {
  const rows = await prisma.$queryRaw`
    SELECT COUNT(*) AS count
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'Student'
      AND column_name = 'courseId'
  `;

  const first = Array.isArray(rows) ? rows[0] : null;
  const value = Number(first?.count ?? 0);
  return value > 0;
}

async function loginUI(page: Page, username: string, password = "Pass@123") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function createStudentWithAssignedCourse() {
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  if (!tenant) throw new Error("Tenant DEFAULT not found");

  const centerUser = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, role: "CENTER", username: "CE001" },
    select: { hierarchyNodeId: true, id: true }
  });
  if (!centerUser?.hierarchyNodeId) throw new Error("Center CE001 not found");

  const level = await prisma.level.findFirst({
    where: { tenantId: tenant.id, rank: 1 },
    select: { id: true, name: true }
  });
  if (!level) throw new Error("Level 1 not found");

  const course = await prisma.course.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, code: true, name: true }
  });
  if (!course) throw new Error("Active course not found");

  const suffix = `${Date.now().toString(36).toUpperCase()}`;
  const username = `STE2E${suffix}`.slice(0, 20);
  const email = `${username.toLowerCase()}@e2e.local`;
  const admissionNo = `E2E-${suffix}`.slice(0, 24);
  const passwordHash = await bcrypt.hash("Pass@123", 10);

  const student = await prisma.student.create({
    data: {
      tenantId: tenant.id,
      admissionNo,
      firstName: "E2E",
      lastName: "Student",
      hierarchyNodeId: centerUser.hierarchyNodeId,
      levelId: level.id,
      isActive: true,
      email
    },
    select: { id: true }
  });

  await prisma.$executeRawUnsafe("UPDATE Student SET courseId = ? WHERE id = ?", course.id, student.id);

  await prisma.authUser.create({
    data: {
      tenantId: tenant.id,
      email,
      username,
      role: "STUDENT",
      passwordHash,
      studentId: student.id,
      hierarchyNodeId: centerUser.hierarchyNodeId,
      parentUserId: centerUser.id,
      mustChangePassword: false,
      isActive: true
    }
  });

  return { username, courseCode: course.code, courseName: course.name };
}

test("Center can view My Courses page", async ({ page }) => {
  await loginUI(page, "CE001");
  await page.waitForURL("**/center/dashboard", { timeout: 30_000 });

  await page.goto("/center/courses");
  await expect(page.getByRole("heading", { name: "My Courses" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Code" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
});

test("Franchise can view My Courses page", async ({ page }) => {
  await loginUI(page, "FR001");
  await page.waitForURL("**/franchise/dashboard", { timeout: 30_000 });

  await page.goto("/franchise/courses");
  await expect(page.getByRole("heading", { name: "My Courses" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Code" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
});

test("Student dashboard shows assigned course", async ({ page }) => {
  const supportsCourseId = await hasStudentCourseColumn();
  test.skip(!supportsCourseId, "Skipping: current DB schema has no Student.courseId column");

  const fixture = await createStudentWithAssignedCourse();

  await loginUI(page, fixture.username);
  await page.waitForURL("**/student/dashboard", { timeout: 30_000 });

  await expect(page.getByText("Assigned Course")).toBeVisible();
  await expect(page.getByText(fixture.courseName, { exact: false })).toBeVisible();
  await expect(page.getByText(fixture.courseCode, { exact: false })).toBeVisible();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
