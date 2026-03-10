const base = process.env.API_BASE || "http://localhost:4000";

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

async function apiJson(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const json = await asJson(res);
  if (!json.success) {
    const err = new Error(`${method} ${path} failed: ${res.status} ${json.error_code || ""} ${json.message || ""}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

function randomId(prefix) {
  const s = Math.random().toString(16).slice(2);
  return `${prefix}_${Date.now()}_${s}`;
}

async function ensurePublishedBaseWorksheet({ token, levelId, levelName }) {
  // Find a published, non-exam-cycle worksheet for the level.
  const list = await apiJson(`/api/worksheets?levelId=${encodeURIComponent(levelId)}&published=true&limit=50&offset=0`, {
    token
  });
  const items = Array.isArray(list.data) ? list.data : [];
  const eligible = items
    .filter((w) => !w?.examCycleId)
    .filter((w) => (w?.questionCount ?? 0) > 0);

  if (eligible.length) {
    return eligible[0];
  }

  // Create + add questions + publish.
  const created = await apiJson("/api/worksheets", {
    method: "POST",
    token,
    body: {
      title: `${levelName || "Level"} Exam Worksheet ${randomId("base")}`,
      description: "Base exam worksheet (smoke)",
      difficulty: "MEDIUM",
      levelId,
      isPublished: false
    }
  });

  const worksheetId = created.data.id;

  const questions = [
    { operands: { a: 1, b: 2 }, operation: "+", correctAnswer: 3 },
    { operands: { a: 5, b: 4 }, operation: "-", correctAnswer: 1 },
    { operands: { a: 2, b: 3 }, operation: "*", correctAnswer: 6 }
  ];

  for (const q of questions) {
    await apiJson(`/api/worksheets/${worksheetId}/questions`, {
      method: "POST",
      token,
      body: q
    });
  }

  await apiJson(`/api/worksheets/${worksheetId}`, {
    method: "PATCH",
    token,
    body: { isPublished: true }
  });

  const fetched = await apiJson(`/api/worksheets/${worksheetId}`, { token });
  return fetched.data;
}

async function ensurePendingListForSuperadmin({ saToken, bpToken, franchiseToken, centerToken }) {
  // Try to find an existing cycle with pending lists first.
  const cyclesJson = await apiJson("/api/exam-cycles?limit=25&offset=0", { token: saToken });
  const cycles = cyclesJson?.data?.items || [];

  for (const c of cycles) {
    if (!c?.id) continue;
    const pendingJson = await apiJson(`/api/exam-cycles/${c.id}/enrollment-lists/pending`, { token: saToken });
    const pending = Array.isArray(pendingJson.data) ? pendingJson.data : [];
    if (pending.length) {
      return { examCycleId: c.id, listId: pending[0].id };
    }
  }

  // Create a fresh cycle + push a combined list up the chain.
  const partners = await apiJson("/api/business-partners?limit=10&offset=0&q=BP-001", { token: saToken });
  const bp = Array.isArray(partners?.data?.items) ? partners.data.items[0] : null;
  if (!bp?.id) {
    throw new Error("Cannot find business partner BP-001");
  }

  const now = Date.now();
  const examCycle = await apiJson("/api/exam-cycles", {
    method: "POST",
    token: saToken,
    body: {
      businessPartnerId: bp.id,
      name: `Smoke Exam ${randomId("cycle")}`,
      enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      enrollmentEndAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      practiceStartAt: new Date(now).toISOString(),
      examStartsAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
      examEndsAt: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      examDurationMinutes: 45,
      attemptLimit: 1
    }
  });
  const examCycleId = examCycle.data.id;

  // Pick Level 1.
  const levelsJson = await apiJson("/api/levels", { token: saToken });
  const levels = Array.isArray(levelsJson.data) ? levelsJson.data : [];
  const level1 = levels.find((l) => l.rank === 1) || levels[0];
  if (!level1?.id) {
    throw new Error("No levels found");
  }

  // Center creates a temporary student (avoids teacher enrollment prerequisites).
  await apiJson(`/api/exam-cycles/${examCycleId}/temporary-students`, {
    method: "POST",
    token: centerToken,
    body: {
      students: [
        {
          firstName: "Temp",
          lastName: "Exam",
          levelId: level1.id,
          password: "Pass@123"
        }
      ]
    }
  });

  await apiJson(`/api/exam-cycles/${examCycleId}/center-list/prepare`, {
    method: "POST",
    token: centerToken,
    body: {}
  });

  await apiJson(`/api/exam-cycles/${examCycleId}/center-list/submit`, {
    method: "POST",
    token: centerToken,
    body: {}
  });

  // Franchise pending -> forward.
  const pendingFrJson = await apiJson(`/api/exam-cycles/${examCycleId}/enrollment-lists/pending`, {
    token: franchiseToken
  });
  const pendingFr = Array.isArray(pendingFrJson.data) ? pendingFrJson.data : [];
  if (!pendingFr.length) {
    throw new Error("No pending lists for franchise");
  }
  const listId = pendingFr[0].id;

  await apiJson(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`, {
    method: "POST",
    token: franchiseToken,
    body: {}
  });

  // BP forward.
  await apiJson(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`, {
    method: "POST",
    token: bpToken,
    body: {}
  });

  return { examCycleId, listId };
}

async function main() {
  const saToken = await login("SA001", process.env.SA_PASSWORD || "Pass@123");
  const bpToken = await login("BP001", process.env.BP_PASSWORD || "Pass@123");
  const franchiseToken = await login("FR001", process.env.FR_PASSWORD || "Pass@123");
  const centerToken = await login("CE001", process.env.CE_PASSWORD || "Pass@123");

  const { examCycleId, listId } = await ensurePendingListForSuperadmin({ saToken, bpToken, franchiseToken, centerToken });
  console.log("examCycleId:", examCycleId);
  console.log("listId:", listId);

  const breakdownJson = await apiJson(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/level-breakdown`, {
    token: saToken
  });
  const breakdown = Array.isArray(breakdownJson.data) ? breakdownJson.data : [];
  console.log("level-breakdown count:", breakdown.length);
  if (!breakdown.length) {
    throw new Error("No levels found in list breakdown");
  }

  const selections = [];
  for (const b of breakdown) {
    const ws = await ensurePublishedBaseWorksheet({ token: saToken, levelId: b.levelId, levelName: b.levelName });
    selections.push({ levelId: b.levelId, worksheetId: ws.id });
  }

  const approve = await apiJson(`/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/approve`, {
    method: "POST",
    token: saToken,
    body: { selections }
  });

  console.log("approve:", "ok", "worksheetsCreated=", approve?.data?.worksheets?.createdCount);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
