import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL)
});

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
        code: "BP001"
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
      code: "BP001",
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
        code: "FR001"
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
      code: "FR001",
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
      code: "CE001",
      name: "Abacus Public School",
      status: "ACTIVE",
      isActive: true,
      attendanceConfig: { teacherEditWindowHours: 0, defaultEntryStatus: "ABSENT" }
    },
    create: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      authUserId: centerAuth.id,
      code: "CE001",
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
        code: "BP002"
      }
    },
    update: {
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant2.id,
      name: "Other Partner",
      code: "BP002",
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

  // ========================================
  // FEE MANAGEMENT SEED DATA
  // ========================================

  // Create additional teachers
  const teacher2Auth = await upsertUser({
    tenantId: tenant.id,
    email: "teacher.two@abacusweb.local",
    username: "TE002",
    role: "TEACHER",
    passwordHash,
    hierarchyNodeId: school.id,
    parentUserId: centerAuth.id
  });

  await prisma.teacherProfile.upsert({
    where: { authUserId: teacher2Auth.id },
    update: {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      fullName: "Teacher Two",
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      authUserId: teacher2Auth.id,
      fullName: "Teacher Two",
      status: "ACTIVE",
      isActive: true
    }
  });

  const teacher3Auth = await upsertUser({
    tenantId: tenant.id,
    email: "teacher.three@abacusweb.local",
    username: "TE003",
    role: "TEACHER",
    passwordHash,
    hierarchyNodeId: school.id,
    parentUserId: centerAuth.id
  });

  await prisma.teacherProfile.upsert({
    where: { authUserId: teacher3Auth.id },
    update: {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      fullName: "Teacher Three",
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      authUserId: teacher3Auth.id,
      fullName: "Teacher Three",
      status: "ACTIVE",
      isActive: true
    }
  });

  // Create batches
  const batch1 = await prisma.batch.upsert({
    where: {
      tenantId_hierarchyNodeId_name: {
        tenantId: tenant.id,
        hierarchyNodeId: school.id,
        name: "Level 1 - Morning Batch"
      }
    },
    update: {
      name: "Level 1 - Morning Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacherOneAuth.id,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      name: "Level 1 - Morning Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacherOneAuth.id,
      isActive: true
    }
  });

  const batch2 = await prisma.batch.upsert({
    where: {
      tenantId_hierarchyNodeId_name: {
        tenantId: tenant.id,
        hierarchyNodeId: school.id,
        name: "Level 1 - Evening Batch"
      }
    },
    update: {
      name: "Level 1 - Evening Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher2Auth.id,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      name: "Level 1 - Evening Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher2Auth.id,
      isActive: true
    }
  });

  const batch3 = await prisma.batch.upsert({
    where: {
      tenantId_hierarchyNodeId_name: {
        tenantId: tenant.id,
        hierarchyNodeId: school.id,
        name: "Level 2 - Weekend Batch"
      }
    },
    update: {
      name: "Level 2 - Weekend Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher3Auth.id,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      name: "Level 2 - Weekend Batch",
      hierarchyNodeId: school.id,
      primaryTeacherUserId: teacher3Auth.id,
      isActive: true
    }
  });

  // Create additional students with fee data
  const studentsData = [
    {
      admissionNo: "ADM-1003",
      firstName: "Riya",
      lastName: "Gupta",
      email: "riya@example.com",
      phonePrimary: "+91-9876543210",
      guardianPhone: "+91-9876543211",
      levelId: level1.id,
      totalFeeAmount: 12000,
      admissionFeeAmount: 2000,
      feeConcessionAmount: 0,
      batchId: batch1.id
    },
    {
      admissionNo: "ADM-1004",
      firstName: "Arjun",
      lastName: "Patel",
      email: "arjun@example.com",
      phonePrimary: "+91-9876543220",
      guardianPhone: "+91-9876543221",
      levelId: level1.id,
      totalFeeAmount: 12000,
      admissionFeeAmount: 2000,
      feeConcessionAmount: 1000,
      batchId: batch1.id
    },
    {
      admissionNo: "ADM-1005",
      firstName: "Ananya",
      lastName: "Singh",
      email: "ananya@example.com",
      phonePrimary: "+91-9876543230",
      guardianPhone: "+91-9876543231",
      levelId: level1.id,
      totalFeeAmount: 12000,
      admissionFeeAmount: 2000,
      feeConcessionAmount: 0,
      batchId: batch2.id
    },
    {
      admissionNo: "ADM-1006",
      firstName: "Vivaan",
      lastName: "Kumar",
      email: "vivaan@example.com",
      phonePrimary: "+91-9876543240",
      guardianPhone: "+91-9876543241",
      levelId: level2.id,
      totalFeeAmount: 15000,
      admissionFeeAmount: 3000,
      feeConcessionAmount: 500,
      batchId: batch3.id
    },
    {
      admissionNo: "ADM-1007",
      firstName: "Ishaan",
      lastName: "Reddy",
      email: "ishaan@example.com",
      phonePrimary: "+91-9876543250",
      guardianPhone: "+91-9876543251",
      levelId: level2.id,
      totalFeeAmount: 15000,
      admissionFeeAmount: 3000,
      feeConcessionAmount: 0,
      batchId: batch3.id
    },
    {
      admissionNo: "ADM-1008",
      firstName: "Saanvi",
      lastName: "Mehta",
      email: "saanvi@example.com",
      phonePrimary: "+91-9876543260",
      guardianPhone: "+91-9876543261",
      levelId: level1.id,
      totalFeeAmount: 12000,
      admissionFeeAmount: 2000,
      feeConcessionAmount: 2000,
      batchId: batch2.id
    }
  ];

  const createdStudents = [];
  for (const studentData of studentsData) {
    const student = await prisma.student.upsert({
      where: {
        tenantId_admissionNo: {
          tenantId: tenant.id,
          admissionNo: studentData.admissionNo
        }
      },
      update: {
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        email: studentData.email,
        phonePrimary: studentData.phonePrimary,
        guardianPhone: studentData.guardianPhone,
        hierarchyNodeId: school.id,
        levelId: studentData.levelId,
        totalFeeAmount: studentData.totalFeeAmount,
        admissionFeeAmount: studentData.admissionFeeAmount,
        feeConcessionAmount: studentData.feeConcessionAmount,
        isActive: true
      },
      create: {
        tenantId: tenant.id,
        admissionNo: studentData.admissionNo,
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        email: studentData.email,
        phonePrimary: studentData.phonePrimary,
        guardianPhone: studentData.guardianPhone,
        hierarchyNodeId: school.id,
        levelId: studentData.levelId,
        totalFeeAmount: studentData.totalFeeAmount,
        admissionFeeAmount: studentData.admissionFeeAmount,
        feeConcessionAmount: studentData.feeConcessionAmount,
        isActive: true
      }
    });
    createdStudents.push({ ...student, batchId: studentData.batchId });
  }

  // Update existing students with fee amounts and phones
  await prisma.student.update({
    where: { id: student1.id },
    data: {
      phonePrimary: "+91-9876543200",
      guardianPhone: "+91-9876543201",
      totalFeeAmount: 12000,
      admissionFeeAmount: 2000,
      feeConcessionAmount: 0,
      isActive: true
    }
  });

  await prisma.student.update({
    where: { id: student2.id },
    data: {
      phonePrimary: "+91-9876543205",
      guardianPhone: "+91-9876543206",
      totalFeeAmount: 15000,
      admissionFeeAmount: 3000,
      feeConcessionAmount: 1500,
      isActive: true
    }
  });

  // Enroll students in batches
  const batchEnrollments = [
    { studentId: student1.id, batchId: batch1.id },
    { studentId: student2.id, batchId: batch3.id },
    ...createdStudents.map((s) => ({ studentId: s.id, batchId: s.batchId }))
  ];

  for (const enrollment of batchEnrollments) {
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        tenantId: tenant.id,
        batchId: enrollment.batchId,
        studentId: enrollment.studentId
      },
      select: { id: true }
    });

    const enrollmentPayload = {
      tenantId: tenant.id,
      hierarchyNodeId: school.id,
      batchId: enrollment.batchId,
      studentId: enrollment.studentId,
      assignedTeacherUserId: null,
      levelId: null,
      startDate: new Date("2025-01-01"),
      status: "ACTIVE"
    };

    if (existingEnrollment?.id) {
      await prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: enrollmentPayload
      });
    } else {
      await prisma.enrollment.create({
        data: enrollmentPayload
      });
    }
  }

  // Create fee installments for each student
  const allStudentsWithFees = [student1, student2, ...createdStudents];
  
  for (const student of allStudentsWithFees) {
    const studentRecord = await prisma.student.findUnique({
      where: { id: student.id },
      select: { totalFeeAmount: true, admissionFeeAmount: true, feeConcessionAmount: true }
    });

    const totalFee = studentRecord.totalFeeAmount || 12000;
    const admissionFee = studentRecord.admissionFeeAmount || 2000;
    const concession = studentRecord.feeConcessionAmount || 0;
    const tuitionFee = totalFee - admissionFee - concession;
    const monthlyInstallment = Math.round(tuitionFee / 12);

    // Create installments for the year (some overdue, some pending, some future)
    const installmentsData = [];
    
    // Jan-March: Overdue (not paid)
    installmentsData.push({
      tenantId: tenant.id,
      studentId: student.id,
      amount: monthlyInstallment,
      dueDate: new Date("2025-01-10"),
      description: "January 2025 Tuition"
    });
    installmentsData.push({
      tenantId: tenant.id,
      studentId: student.id,
      amount: monthlyInstallment,
      dueDate: new Date("2025-02-10"),
      description: "February 2025 Tuition"
    });
    installmentsData.push({
      tenantId: tenant.id,
      studentId: student.id,
      amount: monthlyInstallment,
      dueDate: new Date("2025-03-10"),
      description: "March 2025 Tuition"
    });

    // April-May: Some paid, some pending
    installmentsData.push({
      tenantId: tenant.id,
      studentId: student.id,
      amount: monthlyInstallment,
      dueDate: new Date("2025-04-10"),
      description: "April 2025 Tuition"
    });
    installmentsData.push({
      tenantId: tenant.id,
      studentId: student.id,
      amount: monthlyInstallment,
      dueDate: new Date("2025-05-10"),
      description: "May 2025 Tuition"
    });

    // June onwards: Future
    for (let month = 6; month <= 12; month++) {
      installmentsData.push({
        tenantId: tenant.id,
        studentId: student.id,
        amount: monthlyInstallment,
        dueDate: new Date(`2025-${String(month).padStart(2, "0")}-10`),
        description: `${new Date(2025, month - 1).toLocaleString("default", { month: "long" })} 2025 Tuition`
      });
    }

    // Create installments
    for (const installmentData of installmentsData) {
      const existingInstallment = await prisma.studentFeeInstallment.findFirst({
        where: {
          tenantId: installmentData.tenantId,
          studentId: installmentData.studentId,
          dueDate: installmentData.dueDate
        },
        select: { id: true }
      });

      if (existingInstallment?.id) {
        await prisma.studentFeeInstallment.update({
          where: { id: existingInstallment.id },
          data: {
            tenantId: installmentData.tenantId,
            studentId: installmentData.studentId,
            amount: installmentData.amount,
            dueDate: installmentData.dueDate
          }
        });
      } else {
        await prisma.studentFeeInstallment.create({
          data: {
            tenantId: installmentData.tenantId,
            studentId: installmentData.studentId,
            amount: installmentData.amount,
            dueDate: installmentData.dueDate
          }
        });
      }
    }
  }

  // Create some payment transactions (partial payments for some students)
  const paymentsData = [
    {
      // Student 1: Paid Jan & Feb fully
      studentId: student1.id,
      installmentDate: new Date("2025-01-10"),
      amount: 850, // full payment
      paymentDate: new Date("2025-01-15"),
      mode: "CASH"
    },
    {
      studentId: student1.id,
      installmentDate: new Date("2025-02-10"),
      amount: 850,
      paymentDate: new Date("2025-02-15"),
      mode: "UPI"
    },
    {
      // Student 2: Partial payment for Jan
      studentId: student2.id,
      installmentDate: new Date("2025-01-10"),
      amount: 500, // partial
      paymentDate: new Date("2025-01-20"),
      mode: "CASH"
    },
    {
      // Student 3 (Riya): Paid Jan fully, partial Feb
      studentId: createdStudents[0].id,
      installmentDate: new Date("2025-01-10"),
      amount: 850,
      paymentDate: new Date("2025-01-12"),
      mode: "UPI"
    },
    {
      studentId: createdStudents[0].id,
      installmentDate: new Date("2025-02-10"),
      amount: 400,
      paymentDate: new Date("2025-02-18"),
      mode: "CASH"
    }
  ];

  for (const payment of paymentsData) {
    const installment = await prisma.studentFeeInstallment.findFirst({
      where: {
        tenantId: tenant.id,
        studentId: payment.studentId,
        dueDate: payment.installmentDate
      }
    });

    if (installment) {
      await prisma.financialTransaction.create({
        data: {
          tenantId: tenant.id,
          centerId: school.id,
          studentId: payment.studentId,
          installmentId: installment.id,
          type: "ENROLLMENT",
          grossAmount: payment.amount,
          netAmount: payment.amount,
          paymentMode: payment.mode,
          receivedAt: payment.paymentDate,
          createdAt: payment.paymentDate
        }
      });
    }
  }

  console.log("Seed completed. Login: SA001 / Pass@123 / tenant DEFAULT");
  console.log(`Cross-tenant competition id: ${tenant2Competition.id}`);
  console.log("===== FEE SEED DATA =====");
  console.log("Teachers: TE001, TE002, TE003");
  console.log("Batches: BATCH-L1-MORNING, BATCH-L1-EVENING, BATCH-L2-WEEKEND");
  console.log(`Students with fees: ${allStudentsWithFees.length} total`);
  console.log("Installments: Jan-Dec 2025 (some overdue, some pending, some future)");
  console.log("Payments: Sample payments for testing (some full, some partial)");
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
