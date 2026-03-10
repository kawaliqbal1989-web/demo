import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

function envText(name, fallback = "") {
  const raw = process.env[name];
  return raw && String(raw).trim() ? String(raw).trim() : fallback;
}

async function resolveStudentAndEnrollment({ tenantId, centerNodeId, studentUsername, batchId }) {
  let studentId = null;

  if (studentUsername) {
    const studentAuth = await prisma.authUser.findFirst({
      where: {
        tenantId,
        role: "STUDENT",
        username: studentUsername
      },
      select: {
        studentId: true
      }
    });
    studentId = studentAuth?.studentId || null;
    if (!studentId) {
      throw new Error(`Student login not found for username '${studentUsername}'`);
    }
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      hierarchyNodeId: centerNodeId,
      status: "ACTIVE",
      ...(studentId ? { studentId } : {}),
      ...(batchId ? { batchId } : {})
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          levelId: true,
          authUsers: {
            where: {
              role: "STUDENT"
            },
            select: {
              username: true
            },
            take: 1
          }
        }
      },
      batch: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!enrollment) {
    throw new Error("No ACTIVE enrollment found for fixture creation (try setting STUDENT_USERNAME or BATCH_ID)");
  }

  return enrollment;
}

async function ensurePublishedWorksheet({ tenantId, createdByUserId, levelId, titlePrefix }) {
  const existing = await prisma.worksheet.findFirst({
    where: {
      tenantId,
      levelId,
      isPublished: true,
      title: {
        startsWith: titlePrefix
      },
      questions: {
        some: {}
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true,
      title: true
    }
  });

  if (existing) {
    return existing;
  }

  const nowTag = Date.now();
  const worksheet = await prisma.worksheet.create({
    data: {
      tenantId,
      title: `${titlePrefix} ${nowTag}`,
      description: "Auto-created smoke worksheet for online mock test flow",
      difficulty: "MEDIUM",
      levelId,
      createdByUserId,
      isPublished: false,
      timeLimitSeconds: 600
    },
    select: {
      id: true,
      title: true
    }
  });

  await prisma.worksheetQuestion.create({
    data: {
      tenantId,
      worksheetId: worksheet.id,
      questionNumber: 1,
      operands: {
        a: 7,
        b: 5,
        expr: "7 + 5"
      },
      operation: "ADD",
      correctAnswer: 12
    }
  });

  await prisma.worksheet.update({
    where: {
      id: worksheet.id
    },
    data: {
      isPublished: true
    }
  });

  return worksheet;
}

async function createPublishedMockTest({
  tenantId,
  centerNodeId,
  batchId,
  worksheetId,
  createdByUserId,
  titlePrefix,
  maxMarks
}) {
  const nowTag = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const created = await prisma.mockTest.create({
    data: {
      tenantId,
      hierarchyNodeId: centerNodeId,
      batchId,
      worksheetId,
      title: `${titlePrefix} ${nowTag}`,
      date: today,
      maxMarks,
      status: "PUBLISHED",
      createdByUserId
    },
    select: {
      id: true,
      title: true,
      status: true,
      date: true
    }
  });

  return created;
}

async function main() {
  const tenantCode = envText("TENANT_CODE", "DEFAULT");
  const centerUsername = envText("CENTER_USERNAME", "CE001");
  const superadminUsername = envText("SUPERADMIN_USERNAME", "SA001");
  const studentUsername = envText("STUDENT_USERNAME", "");
  const batchId = envText("BATCH_ID", "");
  const worksheetTitlePrefix = envText("WORKSHEET_TITLE_PREFIX", "[SMOKE] Online Mock Worksheet");
  const mockTestTitlePrefix = envText("MOCK_TEST_TITLE_PREFIX", "[SMOKE] Online Mock Test");
  const maxMarks = Number(envText("MAX_MARKS", "100")) || 100;

  const tenant = await prisma.tenant.findFirst({
    where: {
      code: tenantCode
    },
    select: {
      id: true,
      code: true
    }
  });

  if (!tenant) {
    throw new Error(`Tenant not found for code '${tenantCode}'`);
  }

  const centerUser = await prisma.authUser.findFirst({
    where: {
      tenantId: tenant.id,
      role: "CENTER",
      username: centerUsername,
      isActive: true
    },
    select: {
      id: true,
      username: true,
      hierarchyNodeId: true
    }
  });

  if (!centerUser?.hierarchyNodeId) {
    throw new Error(`Center user '${centerUsername}' not found or missing hierarchyNodeId`);
  }

  const superadminUser = await prisma.authUser.findFirst({
    where: {
      tenantId: tenant.id,
      role: "SUPERADMIN",
      username: superadminUsername,
      isActive: true
    },
    select: {
      id: true,
      username: true
    }
  });

  if (!superadminUser) {
    throw new Error(`Superadmin user '${superadminUsername}' not found`);
  }

  const enrollment = await resolveStudentAndEnrollment({
    tenantId: tenant.id,
    centerNodeId: centerUser.hierarchyNodeId,
    studentUsername,
    batchId
  });

  const worksheet = await ensurePublishedWorksheet({
    tenantId: tenant.id,
    createdByUserId: superadminUser.id,
    levelId: enrollment.levelId || enrollment.student?.levelId,
    titlePrefix: worksheetTitlePrefix
  });

  const mockTest = await createPublishedMockTest({
    tenantId: tenant.id,
    centerNodeId: centerUser.hierarchyNodeId,
    batchId: enrollment.batchId,
    worksheetId: worksheet.id,
    createdByUserId: centerUser.id,
    titlePrefix: mockTestTitlePrefix,
    maxMarks: Math.max(1, Math.min(1000, Math.trunc(maxMarks)))
  });

  const studentLoginUsername = enrollment.student?.authUsers?.[0]?.username || studentUsername || null;
  const smokePowerShell = [
    "$base='http://localhost:4000/api'",
    `$tenant='${tenant.code}'`,
    `$username='${studentLoginUsername || "<STUDENT_USERNAME>"}'`,
    "$password='Pass@123'",
    `$mockTestId='${mockTest.id}'`,
    "$login=Invoke-RestMethod -Method Post -Uri \"$base/auth/login\" -ContentType 'application/json' -Body (@{tenantCode=$tenant;username=$username;password=$password}|ConvertTo-Json)",
    "$token=$login.data.access_token",
    "$headers=@{ Authorization = \"Bearer $token\" }",
    "$start=Invoke-RestMethod -Method Post -Uri \"$base/student/mock-tests/$mockTestId/attempt/start\" -Headers $headers",
    "$answersByQuestionId=@{}",
    "foreach($q in $start.data.mockTest.questions){",
    "  $v=$null",
    "  switch($q.operation){",
    "    'ADD' { $v=[int]$q.operands.a + [int]$q.operands.b }",
    "    'SUBTRACT' { $v=[int]$q.operands.a - [int]$q.operands.b }",
    "    'MULTIPLY' { $v=[int]$q.operands.a * [int]$q.operands.b }",
    "    'DIVIDE' { if([int]$q.operands.b -ne 0){ $v=[math]::Truncate(([double]$q.operands.a / [double]$q.operands.b)) } }",
    "  }",
    "  if($null -ne $v){ $answersByQuestionId[$q.questionId]=@{ value=$v } }",
    "}",
    "$submit=Invoke-RestMethod -Method Post -Uri \"$base/student/mock-tests/$mockTestId/attempt/submit\" -Headers $headers -ContentType 'application/json' -Body (@{answersByQuestionId=$answersByQuestionId}|ConvertTo-Json -Depth 6)",
    "$submit | ConvertTo-Json -Depth 8"
  ].join("; ");

  console.log("\n✅ Smoke online mock fixture created\n");
  console.log(
    JSON.stringify(
      {
        tenantCode: tenant.code,
        centerUsername: centerUser.username,
        superadminUsername: superadminUser.username,
        student: {
          id: enrollment.studentId,
          username: studentLoginUsername,
          admissionNo: enrollment.student?.admissionNo,
          name: `${enrollment.student?.firstName || ""} ${enrollment.student?.lastName || ""}`.trim()
        },
        batch: {
          id: enrollment.batchId,
          name: enrollment.batch?.name || null
        },
        worksheet: {
          id: worksheet.id,
          title: worksheet.title,
          isPublished: true
        },
        mockTest: {
          id: mockTest.id,
          title: mockTest.title,
          status: mockTest.status,
          date: mockTest.date
        },
        apiSmokeHints: {
          startAttempt: `/api/student/mock-tests/${mockTest.id}/attempt/start`,
          submitAttempt: `/api/student/mock-tests/${mockTest.id}/attempt/submit`
        },
        smokePowerShell
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("\n❌ Failed to create smoke fixture");
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
