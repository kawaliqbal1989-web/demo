import bcrypt from "bcrypt";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function upsertUser({
  tenantId,
  email,
  username,
  role,
  passwordHash,
  hierarchyNodeId = null,
  parentUserId = null,
  mustChangePassword = false
}) {
  return prisma.authUser.upsert({
    where: {
      tenantId_email: {
        tenantId,
        email
      }
    },
    update: {
      username,
      role,
      passwordHash,
      hierarchyNodeId,
      parentUserId,
      mustChangePassword,
      isActive: true,
      failedAttempts: 0,
      lockUntil: null
    },
    create: {
      tenantId,
      email,
      username,
      role,
      passwordHash,
      hierarchyNodeId,
      parentUserId,
      mustChangePassword,
      isActive: true
    }
  });
}

async function upsertStudent({ tenantId, admissionNo, firstName, lastName, hierarchyNodeId, levelId }) {
  return prisma.student.upsert({
    where: {
      tenantId_admissionNo: {
        tenantId,
        admissionNo
      }
    },
    update: {
      firstName,
      lastName,
      hierarchyNodeId,
      levelId,
      isActive: true
    },
    create: {
      tenantId,
      admissionNo,
      firstName,
      lastName,
      hierarchyNodeId,
      levelId,
      isActive: true
    }
  });
}

async function ensureFinancialTransaction({
  tenantId,
  type,
  createdAt,
  createdByUserId,
  centerId,
  businessPartnerId,
  studentId,
  grossAmount,
  centerShare,
  franchiseShare,
  bpShare,
  platformShare
}) {
  const existing = await prisma.financialTransaction.findFirst({
    where: {
      tenantId,
      type,
      createdAt,
      createdByUserId,
      centerId,
      businessPartnerId: businessPartnerId || null,
      studentId: studentId || null,
      grossAmount: new Prisma.Decimal(String(grossAmount))
    },
    select: { id: true }
  });

  if (existing) {
    return;
  }

  await prisma.financialTransaction.create({
    data: {
      tenantId,
      type,
      createdAt,
      createdByUserId,
      centerId,
      businessPartnerId: businessPartnerId || null,
      studentId: studentId || null,
      franchiseId: null,
      grossAmount: new Prisma.Decimal(String(grossAmount)),
      centerShare: new Prisma.Decimal(String(centerShare)),
      franchiseShare: new Prisma.Decimal(String(franchiseShare)),
      bpShare: new Prisma.Decimal(String(bpShare)),
      platformShare: new Prisma.Decimal(String(platformShare))
    }
  });
}

async function main() {
  const password = process.env.PILOT_PASSWORD || "Pilot@123";
  const passwordHash = await bcrypt.hash(password, 12);

  const tenant = await prisma.tenant.upsert({
    where: { code: "DEFAULT" },
    update: {},
    create: {
      id: "tenant_default",
      name: "Default Tenant",
      code: "DEFAULT"
    }
  });

  const country = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "IN"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "India",
      code: "IN",
      type: "COUNTRY"
    }
  });

  const region = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "IN-NORTH"
      }
    },
    update: {
      parentId: country.id
    },
    create: {
      tenantId: tenant.id,
      name: "North Region",
      code: "IN-NORTH",
      type: "REGION",
      parentId: country.id
    }
  });

  const level1 = await prisma.level.upsert({
    where: {
      tenantId_rank: {
        tenantId: tenant.id,
        rank: 1
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Level 1",
      rank: 1,
      description: "Beginner"
    }
  });

  const superadminAuth = await upsertUser({
    tenantId: tenant.id,
    email: "superadmin@abacusweb.local",
    username: "SA001",
    role: "SUPERADMIN",
    passwordHash,
    hierarchyNodeId: region.id,
    mustChangePassword: false
  });

  const bpAuth = await upsertUser({
    tenantId: tenant.id,
    email: "pilot.bp@abacusweb.local",
    username: "BP900",
    role: "BP",
    passwordHash,
    hierarchyNodeId: region.id,
    parentUserId: superadminAuth.id,
    mustChangePassword: true
  });

  const businessPartner = await prisma.businessPartner.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "PILOT-BP-001"
      }
    },
    update: {
      contactEmail: bpAuth.email,
      hierarchyNodeId: region.id,
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt: addDays(new Date(), 90),
      gracePeriodUntil: addDays(new Date(), 97)
    },
    create: {
      tenantId: tenant.id,
      name: "Pilot Business Partner",
      code: "PILOT-BP-001",
      contactEmail: bpAuth.email,
      hierarchyNodeId: region.id,
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt: addDays(new Date(), 90),
      gracePeriodUntil: addDays(new Date(), 97),
      centerSharePercent: 60,
      franchiseSharePercent: 0,
      bpSharePercent: 30,
      platformSharePercent: 10,
      createdByUserId: superadminAuth.id
    }
  });

  const center1 = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "PILOT-CEN-001"
      }
    },
    update: {
      parentId: region.id
    },
    create: {
      tenantId: tenant.id,
      name: "Pilot Center 1",
      code: "PILOT-CEN-001",
      type: "SCHOOL",
      parentId: region.id
    }
  });

  const center2 = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "PILOT-CEN-002"
      }
    },
    update: {
      parentId: region.id
    },
    create: {
      tenantId: tenant.id,
      name: "Pilot Center 2",
      code: "PILOT-CEN-002",
      type: "SCHOOL",
      parentId: region.id
    }
  });

  const centerAuth1 = await upsertUser({
    tenantId: tenant.id,
    email: "pilot.center1@abacusweb.local",
    username: "CE901",
    role: "CENTER",
    passwordHash,
    hierarchyNodeId: center1.id,
    parentUserId: bpAuth.id,
    mustChangePassword: true
  });

  const centerAuth2 = await upsertUser({
    tenantId: tenant.id,
    email: "pilot.center2@abacusweb.local",
    username: "CE902",
    role: "CENTER",
    passwordHash,
    hierarchyNodeId: center2.id,
    parentUserId: bpAuth.id,
    mustChangePassword: true
  });

  await upsertUser({
    tenantId: tenant.id,
    email: "pilot.teacher1@abacusweb.local",
    username: "TE901",
    role: "TEACHER",
    passwordHash,
    hierarchyNodeId: center1.id,
    parentUserId: centerAuth1.id,
    mustChangePassword: true
  });

  await upsertUser({
    tenantId: tenant.id,
    email: "pilot.teacher2@abacusweb.local",
    username: "TE902",
    role: "TEACHER",
    passwordHash,
    hierarchyNodeId: center2.id,
    parentUserId: centerAuth2.id,
    mustChangePassword: true
  });

  const students = [];
  for (let i = 1; i <= 20; i += 1) {
    const admissionNo = `PILOT-${String(i).padStart(4, "0")}`;
    const hierarchyNodeId = i <= 10 ? center1.id : center2.id;
    const student = await upsertStudent({
      tenantId: tenant.id,
      admissionNo,
      firstName: `Student${i}`,
      lastName: "Pilot",
      hierarchyNodeId,
      levelId: level1.id
    });
    students.push(student);
  }

  const competitionTitle = "Pilot Competition 1";
  let competition = await prisma.competition.findFirst({
    where: {
      tenantId: tenant.id,
      title: competitionTitle
    }
  });

  if (!competition) {
    const now = new Date();
    competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: competitionTitle,
        description: "Pilot competition seed",
        status: "ACTIVE",
        workflowStage: "APPROVED",
        startsAt: now,
        endsAt: addDays(now, 7),
        hierarchyNodeId: center1.id,
        levelId: level1.id,
        createdByUserId: centerAuth1.id
      }
    });
  }

  // Seed a few enrollments so competition results CSV has content.
  const enrolled = students.slice(0, 5);
  for (let idx = 0; idx < enrolled.length; idx += 1) {
    const s = enrolled[idx];
    await prisma.competitionEnrollment.upsert({
      where: {
        competitionId_studentId: {
          competitionId: competition.id,
          studentId: s.id
        }
      },
      update: {
        isActive: true,
        rank: idx + 1,
        totalScore: new Prisma.Decimal(String(95 - idx))
      },
      create: {
        tenantId: tenant.id,
        competitionId: competition.id,
        studentId: s.id,
        isActive: true,
        rank: idx + 1,
        totalScore: new Prisma.Decimal(String(95 - idx))
      }
    });
  }

  // Exactly 5 ledger entries, created with fixed timestamp for idempotency.
  const fixedCreatedAt = new Date("2026-02-17T00:00:00.000Z");
  const split = {
    centerSharePercent: businessPartner.centerSharePercent,
    franchiseSharePercent: businessPartner.franchiseSharePercent,
    bpSharePercent: businessPartner.bpSharePercent,
    platformSharePercent: businessPartner.platformSharePercent
  };

  function applySplit(gross) {
    const amount = Number(gross);
    const centerShare = (amount * split.centerSharePercent) / 100;
    const franchiseShare = (amount * split.franchiseSharePercent) / 100;
    const bpShare = (amount * split.bpSharePercent) / 100;
    const platformShare = (amount * split.platformSharePercent) / 100;
    return { centerShare, franchiseShare, bpShare, platformShare };
  }

  const txSpecs = [
    { type: "RENEWAL", grossAmount: 1000, centerId: center1.id, studentId: null },
    { type: "ENROLLMENT", grossAmount: 200, centerId: center1.id, studentId: students[0].id },
    { type: "ENROLLMENT", grossAmount: 200, centerId: center2.id, studentId: students[11].id },
    { type: "COMPETITION", grossAmount: 150, centerId: center1.id, studentId: students[1].id },
    { type: "ADJUSTMENT", grossAmount: 50, centerId: center1.id, studentId: null }
  ];

  for (const spec of txSpecs) {
    const shares = applySplit(spec.grossAmount);
    await ensureFinancialTransaction({
      tenantId: tenant.id,
      type: spec.type,
      createdAt: fixedCreatedAt,
      createdByUserId: superadminAuth.id,
      centerId: spec.centerId,
      businessPartnerId: businessPartner.id,
      studentId: spec.studentId,
      grossAmount: spec.grossAmount,
      centerShare: shares.centerShare,
      franchiseShare: shares.franchiseShare,
      bpShare: shares.bpShare,
      platformShare: shares.platformShare
    });
  }

  // Summary for operator.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    tenant: { id: tenant.id, code: tenant.code },
    bp: { email: bpAuth.email, username: bpAuth.username, code: businessPartner.code },
    centers: [
      { id: center1.id, code: center1.code, centerUser: centerAuth1.username },
      { id: center2.id, code: center2.code, centerUser: centerAuth2.username }
    ],
    teachers: ["TE901", "TE902"],
    students: 20,
    competition: { id: competition.id, title: competition.title },
    ledgerEntries: 5
  }, null, 2));
}

main()
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
