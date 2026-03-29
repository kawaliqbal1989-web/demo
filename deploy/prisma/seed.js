import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function createQuestionBankRows({ tenantId, levelId, rank, templateId }) {
  const difficulties = [
    { type: "EASY", count: 8, base: Math.max(1, rank) },
    { type: "MEDIUM", count: 8, base: Math.max(2, rank + 1) },
    { type: "HARD", count: 8, base: Math.max(3, rank + 2) }
  ];

  const rows = [];
  for (const difficulty of difficulties) {
    for (let index = 1; index <= difficulty.count; index += 1) {
      const left = difficulty.base * 10 + index;
      const right = difficulty.base * 5 + index;
      const isAddition = index % 2 === 0;
      const operation = isAddition ? "ADD" : "SUB";
      const minuend = isAddition ? left : Math.max(left, right);
      const subtrahend = isAddition ? right : Math.min(left, right);
      const correctAnswer = isAddition ? minuend + subtrahend : minuend - subtrahend;

      rows.push({
        tenantId,
        levelId,
        templateId,
        difficulty: difficulty.type,
        prompt: `L${rank}-${difficulty.type}-Q${index}`,
        operands: [minuend, subtrahend],
        operation,
        correctAnswer,
        isActive: true
      });
    }
  }

  return rows;
}

async function upsertUser({
  tenantId,
  email,
  username,
  role,
  passwordHash,
  hierarchyNodeId = null,
  parentUserId = null,
  studentId = null,
  mustChangePassword = true
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
      studentId,
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
      studentId,
      mustChangePassword,
      isActive: true
    }
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run seed in production. Set NODE_ENV to something else to proceed.");
  }

  const passwordHash = await bcrypt.hash("Pass@123", 12);

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
    update: { isActive: true },
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
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      name: "North Region",
      code: "IN-NORTH",
      type: "REGION",
      parentId: country.id
    }
  });

  const school = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "SCH-001"
      }
    },
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      name: "Abacus Public School",
      code: "SCH-001",
      type: "SCHOOL",
      parentId: region.id
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

  const level2 = await prisma.level.upsert({
    where: {
      tenantId_rank: {
        tenantId: tenant.id,
        rank: 2
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Level 2",
      rank: 2,
      description: "Intermediate"
    }
  });

  const superadminAuth = await upsertUser({
    tenantId: tenant.id,
    email: "superadmin@abacusweb.local",
    username: "SA001",
    role: "SUPERADMIN",
    passwordHash,
    hierarchyNodeId: school.id
  });

  const bpAuth = await upsertUser({
    tenantId: tenant.id,
    email: "bp.manager@abacusweb.local",
    username: "BP001",
    role: "BP",
    passwordHash,
    hierarchyNodeId: region.id,
    parentUserId: superadminAuth.id
  });

  const franchiseAuth = await upsertUser({
    tenantId: tenant.id,
    email: "franchise.manager@abacusweb.local",
    username: "FR001",
    role: "FRANCHISE",
    passwordHash,
    hierarchyNodeId: region.id,
    parentUserId: bpAuth.id
  });

  const centerAuth = await upsertUser({
    tenantId: tenant.id,
    email: "center.manager@abacusweb.local",
    username: "CE001",
    role: "CENTER",
    passwordHash,
    hierarchyNodeId: school.id,
    parentUserId: franchiseAuth.id
  });

  await upsertUser({
    tenantId: tenant.id,
    email: "teacher.one@abacusweb.local",
    username: "TE001",
    role: "TEACHER",
    passwordHash,
    hierarchyNodeId: school.id,
    parentUserId: centerAuth.id
  });

  const teacherOneAuth = await prisma.authUser.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      email: "teacher.one@abacusweb.local"
    },
    select: { id: true }
  });

  await prisma.teacherProfile.upsert({
    where: { authUserId: teacherOneAuth.id },
    update: {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      fullName: "Teacher One",
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      authUserId: teacherOneAuth.id,
      fullName: "Teacher One",
      status: "ACTIVE",
      isActive: true
    }
  });

  await prisma.superadmin.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: "superadmin@abacusweb.local"
      }
    },
    update: {
      authUserId: superadminAuth.id
    },
    create: {
      tenantId: tenant.id,
      authUserId: superadminAuth.id,
      email: "superadmin@abacusweb.local",
      fullName: "Abacus Superadmin"
    }
  });

  const course = await prisma.course.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "COURSE-ABACUS"
      }
    },
    update: {
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      code: "COURSE-ABACUS",
      name: "Abacus Core"
    }
  });

  const partner = await prisma.businessPartner.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "BP-001"
      }
    },
    update: {
      status: "ACTIVE",
      isActive: true,
      accessMode: "ALL",
      hierarchyNodeId: region.id
    },
    create: {
      tenantId: tenant.id,
      name: "North Growth Partner",
      code: "BP-001",
      displayName: "North Partner",
      status: "ACTIVE",
      isActive: true,
      contactEmail: "bp.manager@abacusweb.local",
      supportEmail: "support@abacusweb.local",
      primaryPhone: "+91-9999999999",
      whatsappEnabled: true,
      businessType: "COMPANY",
      onboardingDate: new Date(),
      accessMode: "ALL",
      hierarchyNodeId: region.id,
      createdByUserId: superadminAuth.id
    }
  });

  await prisma.businessPartnerAddress.upsert({
    where: { businessPartnerId: partner.id },
    update: {
      addressLine1: "1, Main Road",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      pincode: "110001"
    },
    create: {
      businessPartnerId: partner.id,
      addressLine1: "1, Main Road",
      city: "Delhi",
      state: "Delhi",
      country: "India",
      pincode: "110001"
    }
  });

  await prisma.partnerOperationalState.createMany({
    data: [{ businessPartnerId: partner.id, state: "Delhi" }],
    skipDuplicates: true
  });

  await prisma.partnerCourseAccess.createMany({
    data: [{ businessPartnerId: partner.id, courseId: course.id }],
    skipDuplicates: true
  });

  await prisma.margin.updateMany({
    where: { tenantId: tenant.id, businessPartnerId: partner.id, isActive: true },
    data: { isActive: false }
  });
  await prisma.margin.create({
    data: { tenantId: tenant.id, businessPartnerId: partner.id, marginPercent: 10, isActive: true }
  });

  const franchiseProfile = await prisma.franchiseProfile.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: "FR-001"
      }
    },
    update: {
      status: "ACTIVE",
      isActive: true,
      businessPartnerId: partner.id,
      authUserId: franchiseAuth.id
    },
    create: {
      tenantId: tenant.id,
      businessPartnerId: partner.id,
      authUserId: franchiseAuth.id,
      code: "FR-001",
      name: "North Franchise",
      displayName: "North Franchise",
      status: "ACTIVE",
      isActive: true
    }
  });

  await prisma.centerProfile.upsert({
    where: { authUserId: centerAuth.id },
    update: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      code: "CE-001",
      name: "Abacus Public School",
      status: "ACTIVE",
      isActive: true,
      attendanceConfig: { teacherEditWindowHours: 0, defaultEntryStatus: "ABSENT" }
    },
    create: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      authUserId: centerAuth.id,
      code: "CE-001",
      name: "Abacus Public School",
      displayName: "Abacus Public School",
      status: "ACTIVE",
      isActive: true,
      attendanceConfig: { teacherEditWindowHours: 0, defaultEntryStatus: "ABSENT" }
    }
  });

  const tenant2 = await prisma.tenant.upsert({
    where: { code: "OTHER" },
    update: {},
    create: {
      name: "Other Tenant",
      code: "OTHER"
    }
  });

  const tenant2Country = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant2.id,
        code: "OT-COUNTRY"
      }
    },
    update: { isActive: true },
    create: {
      tenantId: tenant2.id,
      name: "Otherland",
      code: "OT-COUNTRY",
      type: "COUNTRY"
    }
  });

  const tenant2School = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant2.id,
        code: "OT-SCH-001"
      }
    },
    update: { isActive: true },
    create: {
      tenantId: tenant2.id,
      name: "Other Tenant School",
      code: "OT-SCH-001",
      type: "SCHOOL",
      parentId: tenant2Country.id
    }
  });

  const tenant2Level = await prisma.level.upsert({
    where: {
      tenantId_rank: {
        tenantId: tenant2.id,
        rank: 1
      }
    },
    update: {},
    create: {
      tenantId: tenant2.id,
      name: "Other Level 1",
      rank: 1,
      description: "Other tenant beginner"
    }
  });

  const tenant2Bp = await upsertUser({
    tenantId: tenant2.id,
    email: "bp.other@abacusweb.local",
    username: "BP002",
    role: "BP",
    passwordHash,
    hierarchyNodeId: tenant2Country.id,
    parentUserId: superadminAuth.id
  });

  await prisma.businessPartner.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant2.id,
        code: "BP-002"
      }
    },
    update: {
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant2.id,
      name: "Other Partner",
      code: "BP-002",
      displayName: "Other BP",
      status: "ACTIVE",
      isActive: true,
      contactEmail: tenant2Bp.email,
      hierarchyNodeId: tenant2Country.id,
      createdByUserId: superadminAuth.id
    }
  });

  const allLevels = await prisma.level.findMany({
    select: {
      id: true,
      tenantId: true,
      rank: true
    }
  });

  for (const level of allLevels) {
    await prisma.levelRule.upsert({
      where: {
        tenantId_levelId: {
          tenantId: level.tenantId,
          levelId: level.id
        }
      },
      update: {
        passThreshold: 85
      },
      create: {
        tenantId: level.tenantId,
        levelId: level.id,
        minPracticeAverage: 75,
        minExamScore: 85,
        minAccuracy: 85,
        maxAttemptsAllowed: 3,
        minConsistencyScore: 70,
        allowTeacherOverride: true,
        passThreshold: 85
      }
    });

    const template = await prisma.worksheetTemplate.upsert({
      where: {
        tenantId_levelId: {
          tenantId: level.tenantId,
          levelId: level.id
        }
      },
      update: {
        name: `Level ${level.rank} Standard Template`,
        totalQuestions: 20,
        easyCount: 8,
        mediumCount: 8,
        hardCount: 4,
        timeLimitSeconds: 600,
        isActive: true
      },
      create: {
        tenantId: level.tenantId,
        levelId: level.id,
        name: `Level ${level.rank} Standard Template`,
        totalQuestions: 20,
        easyCount: 8,
        mediumCount: 8,
        hardCount: 4,
        timeLimitSeconds: 600,
        isActive: true
      }
    });

    const bankRows = createQuestionBankRows({
      tenantId: level.tenantId,
      levelId: level.id,
      rank: level.rank,
      templateId: template.id
    });

    await prisma.questionBank.createMany({
      data: bankRows,
      skipDuplicates: true
    });
  }

  const student1 = await prisma.student.upsert({
    where: {
      tenantId_admissionNo: {
        tenantId: tenant.id,
        admissionNo: "ADM-1001"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      admissionNo: "ADM-1001",
      firstName: "Aarav",
      lastName: "Sharma",
      email: "aarav@example.com",
      hierarchyNodeId: school.id,
      levelId: level1.id
    }
  });

  const student2 = await prisma.student.upsert({
    where: {
      tenantId_admissionNo: {
        tenantId: tenant.id,
        admissionNo: "ADM-1002"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      admissionNo: "ADM-1002",
      firstName: "Diya",
      lastName: "Verma",
      email: "diya@example.com",
      hierarchyNodeId: school.id,
      levelId: level2.id
    }
  });

  await upsertUser({
    tenantId: tenant.id,
    email: "student.one@abacusweb.local",
    username: "ST0001",
    role: "STUDENT",
    passwordHash,
    hierarchyNodeId: school.id,
    parentUserId: centerAuth.id,
    studentId: student1.id
  });

  let worksheet1 = await prisma.worksheet.findFirst({
    where: {
      tenantId: tenant.id,
      title: "Addition Drill - Level 1",
      levelId: level1.id
    }
  });

  if (!worksheet1) {
    worksheet1 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: "Addition Drill - Level 1",
        description: "Basic speed addition worksheet",
        difficulty: "EASY",
        levelId: level1.id,
        createdByUserId: superadminAuth.id,
        isPublished: true
      }
    });
  }

  let worksheet2 = await prisma.worksheet.findFirst({
    where: {
      tenantId: tenant.id,
      title: "Multiplication Grid - Level 2",
      levelId: level2.id
    }
  });

  if (!worksheet2) {
    worksheet2 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: "Multiplication Grid - Level 2",
        description: "Intermediate multiplication grid",
        difficulty: "MEDIUM",
        levelId: level2.id,
        createdByUserId: superadminAuth.id,
        isPublished: true
      }
    });
  }

  let competition = await prisma.competition.findFirst({
    where: {
      tenantId: tenant.id,
      title: "Winter Abacus Challenge",
      startsAt: new Date("2026-12-15T09:00:00.000Z")
    }
  });

  if (!competition) {
    competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: "Winter Abacus Challenge",
        description: "Annual district level competition",
        status: "SCHEDULED",
        workflowStage: "CENTER_REVIEW",
        startsAt: new Date("2026-12-15T09:00:00.000Z"),
        endsAt: new Date("2026-12-15T12:00:00.000Z"),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadminAuth.id
      }
    });
  }

  let tenant2Competition = await prisma.competition.findFirst({
    where: {
      tenantId: tenant2.id,
      title: "Other Tenant Locked Competition"
    }
  });

  if (!tenant2Competition) {
    tenant2Competition = await prisma.competition.create({
      data: {
        tenantId: tenant2.id,
        title: "Other Tenant Locked Competition",
        description: "Used for cross-tenant access denial tests",
        status: "SCHEDULED",
        workflowStage: "CENTER_REVIEW",
        startsAt: new Date("2026-12-20T09:00:00.000Z"),
        endsAt: new Date("2026-12-20T12:00:00.000Z"),
        hierarchyNodeId: tenant2School.id,
        levelId: tenant2Level.id,
        createdByUserId: tenant2Bp.id
      }
    });
  }

  const worksheetLinks = [
    { competitionId: competition.id, worksheetId: worksheet1.id, tenantId: tenant.id },
    { competitionId: competition.id, worksheetId: worksheet2.id, tenantId: tenant.id }
  ];

  for (const link of worksheetLinks) {
    const existingLink = await prisma.competitionWorksheet.findUnique({
      where: {
        competitionId_worksheetId: {
          competitionId: link.competitionId,
          worksheetId: link.worksheetId
        }
      }
    });

    if (!existingLink) {
      await prisma.competitionWorksheet.create({
        data: link
      });
    }
  }

  const enrollments = [
    { competitionId: competition.id, studentId: student1.id, tenantId: tenant.id },
    { competitionId: competition.id, studentId: student2.id, tenantId: tenant.id }
  ];

  for (const enrollment of enrollments) {
    const existingEnrollment = await prisma.competitionEnrollment.findUnique({
      where: {
        competitionId_studentId: {
          competitionId: enrollment.competitionId,
          studentId: enrollment.studentId
        }
      }
    });

    if (!existingEnrollment) {
      await prisma.competitionEnrollment.create({
        data: enrollment
      });
    }
  }

  const materials = [
    {
      id: "mat_default_global_1",
      tenantId: tenant.id,
      levelId: null,
      title: "Getting Started",
      description: "How to practice effectively and track your progress.",
      type: "LINK",
      url: "https://example.com/abacus/getting-started",
      isPublished: true
    },
    {
      id: "mat_default_level1_1",
      tenantId: tenant.id,
      levelId: level1.id,
      title: "Level 1 Practice Tips",
      description: "Quick tips for Level 1 practice worksheets.",
      type: "LINK",
      url: "https://example.com/abacus/level-1-practice-tips",
      isPublished: true
    },
    {
      id: "mat_default_level2_1",
      tenantId: tenant.id,
      levelId: level2.id,
      title: "Level 2 Practice Tips",
      description: "Quick tips for Level 2 practice worksheets.",
      type: "LINK",
      url: "https://example.com/abacus/level-2-practice-tips",
      isPublished: true
    }
  ];

  for (const material of materials) {
    await prisma.material.upsert({
      where: { id: material.id },
      update: {
        title: material.title,
        description: material.description,
        type: material.type,
        url: material.url,
        isPublished: material.isPublished,
        tenantId: material.tenantId,
        levelId: material.levelId
      },
      create: material
    });
  }

  console.log("Seed completed. Login: SA001 / Pass@123 / tenant DEFAULT");
  console.log(`Cross-tenant competition id: ${tenant2Competition.id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
