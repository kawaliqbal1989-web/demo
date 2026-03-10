const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4000/api";

async function readJsonSafe(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function main() {
  const tenantCode = process.env.TENANT_CODE || "DEFAULT";
  const username = process.env.AUTH_USERNAME || "ST0001";
  const password = process.env.PASSWORD || "Pass@123";

  console.log("BASE_URL", BASE_URL);
  console.log("Logging in as", { tenantCode, username });

  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantCode, username, password })
  });

  const loginBody = await readJsonSafe(loginRes);
  if (!loginRes.ok) {
    console.error("Login failed", loginRes.status, loginBody.text);
    process.exit(1);
  }

  const accessToken = loginBody.json?.data?.access_token;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  console.log("Fetching abacus practice options...");
  const optsRes = await fetch(`${BASE_URL}/student/abacus-practice-worksheets/options`, { headers });
  const optsBody = await readJsonSafe(optsRes);
  if (!optsRes.ok) {
    console.error("Options failed", optsRes.status, optsBody.text);
    process.exit(1);
  }

  const ops = optsBody.json?.data?.operations || [];
  console.log("Allowed ops", ops);

  const createRes = await fetch(`${BASE_URL}/student/abacus-practice-worksheets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      timeLimitSeconds: 600,
      termCount: 3,
      digitsMode: "LOWER_DECK_1_4",
      operations: ops.length ? [ops[0]] : ["ADD"],
      totalQuestions: 20
    })
  });

  const createBody = await readJsonSafe(createRes);
  if (!createRes.ok) {
    console.error("Create failed", createRes.status, createBody.text);
    process.exit(1);
  }

  const worksheetId = createBody.json?.data?.worksheetId;
  console.log("Created worksheetId", worksheetId);

  const attemptRes = await fetch(`${BASE_URL}/student/worksheets/${worksheetId}/attempts/start`, {
    method: "POST",
    headers
  });

  const attemptBody = await readJsonSafe(attemptRes);
  console.log("Attempt status", attemptRes.status);
  const payload = attemptBody.json?.data;
  if (payload?.worksheet?.questions?.length) {
    const q0 = payload.worksheet.questions[0];
    console.log("First question sample", {
      operation: q0.operation,
      operands: q0.operands
    });
  }
  console.log(attemptBody.json || attemptBody.text);

  if (!attemptRes.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
