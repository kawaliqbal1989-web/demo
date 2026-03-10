import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

dotenv.config(
  process.env.DOTENV_CONFIG_PATH
    ? {
        path: process.env.DOTENV_CONFIG_PATH
      }
    : undefined
);

const effectiveDatabaseUrl =
  process.env.E2E_DATABASE_URL || process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

if (effectiveDatabaseUrl) {
  process.env.DATABASE_URL = effectiveDatabaseUrl;
}

const prisma = new PrismaClient();

function maskDbUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

function suffix() {
  const rnd = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `${Date.now().toString(36).toUpperCase()}${rnd}`;
}

function emailFor(prefix, sfx) {
  return `${prefix.toLowerCase()}_${sfx.toLowerCase()}@e2e.local`;
}

export async function createE2EFixture() {
  try {
    await prisma.$connect();
  } catch {
    const hint = effectiveDatabaseUrl
      ? `Prisma can't connect to ${maskDbUrl(effectiveDatabaseUrl)}.`
      : "No DB URL configured.";

    throw new Error(
      [
        `E2E database is not reachable. ${hint}`,
        "",
        "Fix one of:",
        "- Start MySQL (if you use docker compose: start Docker Desktop, then `docker compose -f docker-compose.staging.yml up -d db`)",
        "- Set `E2E_DATABASE_URL` to a reachable MySQL URL (or set `DATABASE_URL_TEST`)",
        "- Ensure the DB is seeded (Tenant DEFAULT, Region IN-NORTH, Level 1)"
      ].join("\n")
    );
  }

  const sfx = suffix();
  const password = "Pass@123";
  const passwordHash = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  if (!tenant) {
    throw new Error("Tenant DEFAULT not found; run seed first");
  }

  const region = await prisma.hierarchyNode.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: "IN-NORTH" } },
    select: { id: true }
  });
  if (!region) {
    throw new Error("Region IN-NORTH not found; run seed first");
  }

  const district = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `E2E District ${sfx}`,
      code: `E2E-DIST-${sfx}`,
      type: "DISTRICT",
      parentId: region.id,
      isActive: true
    },
    select: { id: true }
  });

  const school = await prisma.hierarchyNode.create({
    data: {
      tenantId: tenant.id,
      name: `E2E School ${sfx}`,
      code: `E2E-SCH-${sfx}`,
      type: "SCHOOL",
      parentId: district.id,
      isActive: true
    },
    select: { id: true }
  });

  const superadmin = await prisma.authUser.create({
    data: {
      tenantId: tenant.id,
      email: emailFor("sa", sfx),
      username: `SA${sfx}`,
      role: "SUPERADMIN",
      passwordHash,
      hierarchyNodeId: school.id,
      isActive: true
    },
    select: { id: true, username: true }
  });

  const bpUser = await prisma.authUser.create({
    data: {
      tenantId: tenant.id,
      email: emailFor("bp", sfx),
      username: `BP${sfx}`,
      role: "BP",
      passwordHash,
      hierarchyNodeId: district.id,
      parentUserId: superadmin.id,
      isActive: true
    },
    select: { id: true, username: true, email: true }
  });

  const partner = await prisma.businessPartner.create({
    data: {
      tenantId: tenant.id,
      name: `E2E Partner ${sfx}`,
      code: `BP-E2E-${sfx}`,
      displayName: `E2E Partner ${sfx}`,
      status: "ACTIVE",
      isActive: true,
      accessMode: "ALL",
      contactEmail: bpUser.email,
      hierarchyNodeId: district.id,
      createdByUserId: superadmin.id
    },
    select: { id: true }
  });

  const franchiseUser = await prisma.authUser.create({
    data: {
      tenantId: tenant.id,
      email: emailFor("fr", sfx),
      username: `FR${sfx}`,
      role: "FRANCHISE",
      passwordHash,
      hierarchyNodeId: district.id,
      parentUserId: bpUser.id,
      isActive: true
    },
    select: { id: true, username: true }
  });

  const franchiseProfile = await prisma.franchiseProfile.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: partner.id,
      authUserId: franchiseUser.id,
      code: `FR-E2E-${sfx}`,
      name: `E2E Franchise ${sfx}`,
      displayName: `E2E Franchise ${sfx}`,
      status: "ACTIVE",
      isActive: true
    },
    select: { id: true }
  });

  const centerUser = await prisma.authUser.create({
    data: {
      tenantId: tenant.id,
      email: emailFor("ce", sfx),
      username: `CE${sfx}`,
      role: "CENTER",
      passwordHash,
      hierarchyNodeId: school.id,
      parentUserId: franchiseUser.id,
      isActive: true
    },
    select: { id: true, username: true }
  });

  await prisma.centerProfile.create({
    data: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      authUserId: centerUser.id,
      code: `CE-E2E-${sfx}`,
      name: `E2E Center ${sfx}`,
      displayName: `E2E Center ${sfx}`,
      status: "ACTIVE",
      isActive: true,
      attendanceConfig: { teacherEditWindowHours: 0, defaultEntryStatus: "ABSENT" }
    },
    select: { id: true }
  });

  const level1 = await prisma.level.findUnique({
    where: { tenantId_rank: { tenantId: tenant.id, rank: 1 } },
    select: { id: true, name: true }
  });
  if (!level1) {
    throw new Error("Level 1 not found; run seed first");
  }

  const now = Date.now();
  const examCycle = await prisma.examCycle.create({
    data: {
      tenantId: tenant.id,
      businessPartnerId: partner.id,
      name: `E2E Exam Cycle ${sfx}`,
      code: `EXE2E-${sfx}`,
      enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000),
      enrollmentEndAt: new Date(now + 24 * 60 * 60 * 1000),
      practiceStartAt: new Date(now - 60 * 60 * 1000),
      examStartsAt: new Date(now - 60 * 60 * 1000),
      examEndsAt: new Date(now + 24 * 60 * 60 * 1000),
      examDurationMinutes: 5,
      attemptLimit: 1,
      createdByUserId: superadmin.id
    },
    select: { id: true, code: true, name: true }
  });

  // Base worksheet for Level 1 so SuperAdmin selection dropdown always has at least one option.
  const baseWorksheet = await prisma.worksheet.create({
    data: {
      tenantId: tenant.id,
      title: `E2E Base Exam Worksheet ${sfx}`,
      description: "E2E base worksheet",
      difficulty: "MEDIUM",
      levelId: level1.id,
      createdByUserId: superadmin.id,
      isPublished: true
    },
    select: { id: true }
  });

  await prisma.worksheetQuestion.createMany({
    data: [
      {
        tenantId: tenant.id,
        worksheetId: baseWorksheet.id,
        questionNumber: 1,
        operands: { a: 1, b: 2 },
        operation: "+",
        correctAnswer: 3
      },
      {
        tenantId: tenant.id,
        worksheetId: baseWorksheet.id,
        questionNumber: 2,
        operands: { a: 6, b: 4 },
        operation: "-",
        correctAnswer: 2
      },
      {
        tenantId: tenant.id,
        worksheetId: baseWorksheet.id,
        questionNumber: 3,
        operands: { a: 2, b: 3 },
        operation: "*",
        correctAnswer: 6
      }
    ]
  });

  return {
    tenantId: tenant.id,
    level1,
    examCycle,
    baseWorksheet,
    password,
    users: {
      superadmin,
      bp: { id: bpUser.id, username: bpUser.username },
      franchise: franchiseUser,
      center: centerUser
    }
  };
}

export async function closeE2EDb() {
  await prisma.$disconnect();
}
