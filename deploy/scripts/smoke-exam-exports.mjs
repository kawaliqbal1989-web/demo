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
  const token = await login("SA001", process.env.SA_PASSWORD || "Pass@123");

  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" }, select: { id: true } });
  if (!tenant) throw new Error("Tenant DEFAULT not found");

  const list = await prisma.examEnrollmentList.findFirst({
    where: { tenantId: tenant.id, type: "CENTER_COMBINED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, examCycleId: true, status: true }
  });

  if (!list) {
    console.log("No CENTER_COMBINED list found.");
    return;
  }

  console.log("examCycleId:", list.examCycleId);
  console.log("listId:", list.id);
  console.log("listStatus:", list.status);

  const listRes = await fetch(`${base}/api/exam-cycles/${list.examCycleId}/enrollment-lists/${list.id}/export.csv`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const listCsv = await listRes.text();
  console.log("listExport:", listRes.status, listRes.headers.get("content-type"), "bytes=", Buffer.from(listCsv).length);

  const resultsRes = await fetch(`${base}/api/exam-cycles/${list.examCycleId}/results/export.csv`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const resultsCsv = await resultsRes.text();
  console.log(
    "resultsExport:",
    resultsRes.status,
    resultsRes.headers.get("content-type"),
    "bytes=",
    Buffer.from(resultsCsv).length
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
