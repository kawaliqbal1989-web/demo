import { PrismaClient } from "@prisma/client";

const base = process.env.API_BASE || "http://localhost:4000";
const prisma = new PrismaClient();

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON ${res.status}: ${text.slice(0, 500)}`);
  }
}

async function login(username, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantCode: "DEFAULT", username, password })
  });

  const body = await asJson(res);
  if (!body.success) {
    throw new Error(`Login failed (${username}): ${body.error_code} ${body.message}`);
  }

  return body.data.access_token;
}

async function main() {
  const token = await login("ST0001", process.env.STUDENT_PASSWORD || "Pass@123");

  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  const studentAuth = await prisma.authUser.findFirst({
    where: { tenantId: tenant.id, username: "ST0001" },
    select: { studentId: true }
  });

  if (!studentAuth?.studentId) {
    throw new Error("ST0001 has no studentId");
  }

  const assignment = await prisma.worksheetAssignment.findFirst({
    where: {
      tenantId: tenant.id,
      studentId: studentAuth.studentId,
      isActive: true,
      worksheet: { is: { generationMode: "EXAM" } }
    },
    orderBy: { assignedAt: "desc" },
    select: { worksheetId: true }
  });

  if (!assignment?.worksheetId) {
    console.log("No EXAM worksheet assignment found for ST0001. Approve an exam list first.");
    return;
  }

  const worksheetId = assignment.worksheetId;
  console.log("worksheetId:", worksheetId);

  const ws = await prisma.worksheet.findFirst({
    where: { tenantId: tenant.id, id: worksheetId },
    select: { id: true, examCycleId: true, generationMode: true }
  });

  if (!ws || ws.generationMode !== "EXAM") {
    console.log("Selected worksheet is not EXAM; cannot test device lock.");
    return;
  }

  if (ws.examCycleId) {
    const now = new Date();
    await prisma.examCycle.update({
      where: { id: ws.examCycleId },
      data: {
        enrollmentStartAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        enrollmentEndAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        practiceStartAt: new Date(now.getTime() - 5 * 60 * 1000),
        examStartsAt: new Date(now.getTime() - 60 * 1000),
        examEndsAt: new Date(now.getTime() + 60 * 60 * 1000)
      }
    });
    console.log("Made exam window live for cycle:", ws.examCycleId);
  }

  const sessionA = "sess_A";
  const sessionB = "sess_B";

  const startRes = await fetch(`${base}/api/student/worksheets/${worksheetId}/attempts/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-client-session": sessionA
    },
    body: JSON.stringify({})
  });

  const startJson = await asJson(startRes);
  console.log("start:", startRes.status, startJson.success, startJson.error_code || null);
  if (!startJson.success) {
    console.log(startJson);
    return;
  }

  const attemptId = startJson.data.attemptId;
  console.log("attemptId:", attemptId);

  const saveRes1 = await fetch(`${base}/api/student/attempts/${attemptId}/answers`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-client-session": sessionA
    },
    body: JSON.stringify({
      version: 0,
      answersDelta: {}
    })
  });
  const saveJson1 = await asJson(saveRes1);
  console.log("save A:", saveRes1.status, saveJson1.success, saveJson1.error_code || null);

  const saveRes2 = await fetch(`${base}/api/student/attempts/${attemptId}/answers`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-client-session": sessionB
    },
    body: JSON.stringify({
      version: 0,
      answersDelta: {}
    })
  });
  const saveJson2 = await asJson(saveRes2);
  console.log("save B:", saveRes2.status, saveJson2.success, saveJson2.error_code || null);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
