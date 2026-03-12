import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_CODE = process.env.TENANT_CODE || "DEFAULT";
const PREFIX = process.env.TEST_PREFIX || "T1100";
const STUDENT_COUNT = Number(process.env.STUDENT_COUNT || 1100);
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "Pass@123";
const NUMERIC_SUFFIX = process.env.NUMERIC_SUFFIX || (PREFIX.replace(/\D/g, "") || "1100");

function normalizeNumericSuffix(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || "1100";
}

const STRICT_SUFFIX = normalizeNumericSuffix(NUMERIC_SUFFIX);

function usernameFor(roleCode) {
  return `${roleCode}${STRICT_SUFFIX}`;
}

function codeFor(roleCode) {
  return `${roleCode}${STRICT_SUFFIX}`;
}

function emailFor(localPart) {
  return `${localPart.toLowerCase()}@test.local`;
}

function admissionNoFor(index) {
  return `ST${String(index).padStart(4, "0")}`;
}

async function upsertAuthUser({
  tenantId,
  username,
  email,
  role,
  passwordHash,
  hierarchyNodeId,
  parentUserId,
  isActive = true
}) {
  return prisma.authUser.upsert({
    where: {
      tenantId_username: {
        tenantId,
        username
      }
    },
    update: {
      email,
      role,
      passwordHash,
      hierarchyNodeId,
      parentUserId,
      isActive,
      failedAttempts: 0,
      lockUntil: null,
      mustChangePassword: false
    },
    create: {
      tenantId,
      username,
      email,
      role,
      passwordHash,
      hierarchyNodeId,
      parentUserId,
      isActive,
      mustChangePassword: false
    }
  });
}

async function main() {
  if (!Number.isInteger(STUDENT_COUNT) || STUDENT_COUNT <= 0) {
    throw new Error("STUDENT_COUNT must be a positive integer");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { code: TENANT_CODE },
    select: { id: true, code: true }
  });

  if (!tenant) {
    throw new Error(`Tenant not found for code: ${TENANT_CODE}`);
  }

  const level = await prisma.level.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true, name: true }
  });

  if (!level) {
    throw new Error("No level found for tenant. Create at least one level before running this script.");
  }

  const superadmin = await prisma.authUser.findFirst({
    where: {
      tenantId: tenant.id,
      role: "SUPERADMIN",
      isActive: true
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (!superadmin) {
    throw new Error("No active SUPERADMIN found for tenant.");
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const country = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: `${PREFIX}-COUNTRY`
      }
    },
    update: {
      name: `Test Country ${PREFIX}`,
      type: "COUNTRY",
      parentId: null,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      code: `${PREFIX}-COUNTRY`,
      name: `Test Country ${PREFIX}`,
      type: "COUNTRY",
      isActive: true
    }
  });

  const region = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: `${PREFIX}-REGION`
      }
    },
    update: {
      name: `Test Region ${PREFIX}`,
      type: "REGION",
      parentId: country.id,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      code: `${PREFIX}-REGION`,
      name: `Test Region ${PREFIX}`,
      type: "REGION",
      parentId: country.id,
      isActive: true
    }
  });

  const centerNode = await prisma.hierarchyNode.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: `${PREFIX}-CENTER`
      }
    },
    update: {
      name: `Test Center Node ${PREFIX}`,
      type: "SCHOOL",
      parentId: region.id,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      code: `${PREFIX}-CENTER`,
      name: `Test Center Node ${PREFIX}`,
      type: "SCHOOL",
      parentId: region.id,
      isActive: true
    }
  });

  const bpUser = await upsertAuthUser({
    tenantId: tenant.id,
    username: usernameFor("BP"),
    email: emailFor(`bp-${PREFIX}`),
    role: "BP",
    passwordHash,
    hierarchyNodeId: region.id,
    parentUserId: superadmin.id,
    isActive: true
  });

  const franchiseUser = await upsertAuthUser({
    tenantId: tenant.id,
    username: usernameFor("FR"),
    email: emailFor(`franchise-${PREFIX}`),
    role: "FRANCHISE",
    passwordHash,
    hierarchyNodeId: region.id,
    parentUserId: bpUser.id,
    isActive: true
  });

  const centerUser = await upsertAuthUser({
    tenantId: tenant.id,
    username: usernameFor("CE"),
    email: emailFor(`center-${PREFIX}`),
    role: "CENTER",
    passwordHash,
    hierarchyNodeId: centerNode.id,
    parentUserId: franchiseUser.id,
    isActive: true
  });

  const teacherUser = await upsertAuthUser({
    tenantId: tenant.id,
    username: usernameFor("TE"),
    email: emailFor(`teacher-${PREFIX}`),
    role: "TEACHER",
    passwordHash,
    hierarchyNodeId: centerNode.id,
    parentUserId: centerUser.id,
    isActive: true
  });

  const businessPartner = await prisma.businessPartner.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: codeFor("BP")
      }
    },
    update: {
      name: `Business Partner ${PREFIX}`,
      status: "ACTIVE",
      isActive: true,
      contactEmail: bpUser.email,
      hierarchyNodeId: region.id,
      createdByUserId: superadmin.id,
      subscriptionStatus: "ACTIVE"
    },
    create: {
      tenantId: tenant.id,
      name: `Business Partner ${PREFIX}`,
      code: codeFor("BP"),
      status: "ACTIVE",
      isActive: true,
      contactEmail: bpUser.email,
      hierarchyNodeId: region.id,
      createdByUserId: superadmin.id,
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }
  });

  const franchiseProfile = await prisma.franchiseProfile.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: codeFor("FR")
      }
    },
    update: {
      businessPartnerId: businessPartner.id,
      authUserId: franchiseUser.id,
      name: `Franchise ${PREFIX}`,
      displayName: `Franchise ${PREFIX}`,
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      businessPartnerId: businessPartner.id,
      authUserId: franchiseUser.id,
      code: codeFor("FR"),
      name: `Franchise ${PREFIX}`,
      displayName: `Franchise ${PREFIX}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  const centerProfile = await prisma.centerProfile.upsert({
    where: {
      tenantId_code: {
        tenantId: tenant.id,
        code: codeFor("CE")
      }
    },
    update: {
      franchiseProfileId: franchiseProfile.id,
      authUserId: centerUser.id,
      name: `Center ${PREFIX}`,
      displayName: `Center ${PREFIX}`,
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      franchiseProfileId: franchiseProfile.id,
      authUserId: centerUser.id,
      code: codeFor("CE"),
      name: `Center ${PREFIX}`,
      displayName: `Center ${PREFIX}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  const teacherProfile = await prisma.teacherProfile.upsert({
    where: {
      authUserId: teacherUser.id
    },
    update: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      fullName: `Teacher ${PREFIX}`,
      status: "ACTIVE",
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      authUserId: teacherUser.id,
      fullName: `Teacher ${PREFIX}`,
      status: "ACTIVE",
      isActive: true
    }
  });

  const batch = await prisma.batch.upsert({
    where: {
      tenantId_hierarchyNodeId_name: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        name: `BATCH-${PREFIX}`
      }
    },
    update: {
      status: "ACTIVE",
      isActive: true,
      schedule: { mode: "WEEKDAY", slot: "09:00-11:00" }
    },
    create: {
      tenantId: tenant.id,
      hierarchyNodeId: centerNode.id,
      name: `BATCH-${PREFIX}`,
      status: "ACTIVE",
      isActive: true,
      schedule: { mode: "WEEKDAY", slot: "09:00-11:00" }
    }
  });

  await prisma.batchTeacherAssignment.upsert({
    where: {
      batchId_teacherUserId: {
        batchId: batch.id,
        teacherUserId: teacherUser.id
      }
    },
    update: {
      tenantId: tenant.id
    },
    create: {
      tenantId: tenant.id,
      batchId: batch.id,
      teacherUserId: teacherUser.id
    }
  });

  const createdStudentIds = [];
  let createdStudents = 0;
  let updatedStudents = 0;

  for (let i = 1; i <= STUDENT_COUNT; i += 1) {
    const admissionNo = admissionNoFor(i);
    const result = await prisma.student.upsert({
      where: {
        tenantId_admissionNo: {
          tenantId: tenant.id,
          admissionNo
        }
      },
      update: {
        firstName: `Student${i}`,
        lastName: PREFIX,
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true,
        currentTeacherUserId: teacherUser.id
      },
      create: {
        tenantId: tenant.id,
        admissionNo,
        firstName: `Student${i}`,
        lastName: PREFIX,
        hierarchyNodeId: centerNode.id,
        levelId: level.id,
        isActive: true,
        currentTeacherUserId: teacherUser.id
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Heuristic: on fresh create, timestamps are usually equal.
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      createdStudents += 1;
    } else {
      updatedStudents += 1;
    }

    createdStudentIds.push(result.id);

    if (i % 100 === 0) {
      console.log(`Processed students: ${i}/${STUDENT_COUNT}`);
    }
  }

  await prisma.enrollment.deleteMany({
    where: {
      tenantId: tenant.id,
      batchId: batch.id,
      studentId: { in: createdStudentIds }
    }
  });

  const enrollmentRows = createdStudentIds.map((studentId) => ({
    tenantId: tenant.id,
    hierarchyNodeId: centerNode.id,
    studentId,
    batchId: batch.id,
    assignedTeacherUserId: teacherUser.id,
    levelId: level.id,
    status: "ACTIVE"
  }));

  await prisma.enrollment.createMany({
    data: enrollmentRows
  });

  const [studentCount, enrollmentCount, teacherMapCount] = await Promise.all([
    prisma.student.count({
      where: {
        tenantId: tenant.id,
        hierarchyNodeId: centerNode.id,
        admissionNo: { startsWith: "ST" }
      }
    }),
    prisma.enrollment.count({
      where: {
        tenantId: tenant.id,
        batchId: batch.id,
        status: "ACTIVE"
      }
    }),
    prisma.batchTeacherAssignment.count({
      where: {
        tenantId: tenant.id,
        batchId: batch.id,
        teacherUserId: teacherUser.id
      }
    })
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantCode: TENANT_CODE,
        prefix: PREFIX,
        passwordForCreatedUsers: DEFAULT_PASSWORD,
        entities: {
          businessPartner: { id: businessPartner.id, code: businessPartner.code },
          franchiseProfile: { id: franchiseProfile.id, code: franchiseProfile.code },
          centerProfile: { id: centerProfile.id, code: centerProfile.code },
          teacherProfile: { id: teacherProfile.id, authUserId: teacherUser.id, username: teacherUser.username },
          batch: { id: batch.id, name: batch.name }
        },
        students: {
          requested: STUDENT_COUNT,
          processed: createdStudentIds.length,
          createdApprox: createdStudents,
          updatedApprox: updatedStudents,
          centerScopedCount: studentCount
        },
        mappings: {
          batchTeacherAssignments: teacherMapCount,
          batchEnrollments: enrollmentCount
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
