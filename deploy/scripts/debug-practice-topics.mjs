const BASE_URL = process.env.BASE_URL || "http://localhost:4000/api";

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
  const password = process.env.LOGIN_PASSWORD || "Pass@123";

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
  if (!accessToken) {
    console.error("Login succeeded but access_token missing", loginBody.json);
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  console.log("Fetching practice options...");
  const optsRes = await fetch(`${BASE_URL}/student/practice-worksheets/options`, { headers });
  const optsBody = await readJsonSafe(optsRes);
  if (!optsRes.ok) {
    console.error("Options failed", optsRes.status, optsBody.text);
    process.exit(1);
  }

  const level = optsBody.json?.data?.level;
  const operations = optsBody.json?.data?.operations || [];
  const topics = optsBody.json?.data?.topics || [];

  console.log("Level", level);
  console.log("Operations", operations);
  console.log("Topics count", Array.isArray(topics) ? topics.length : null);

  if (!Array.isArray(topics) || topics.length === 0) {
    console.log("No topics returned. Import workbook with sectionTitle first.");
    return;
  }

  const chosenTopic = topics[0];
  const chosenOps = operations.includes("COLUMN_SUM") ? ["COLUMN_SUM"] : operations.slice(0, 1);

  console.log("Creating practice worksheet with", { chosenTopic, chosenOps });
  const createRes = await fetch(`${BASE_URL}/student/practice-worksheets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      totalQuestions: 20,
      timeLimitSeconds: 600,
      operations: chosenOps,
      topics: [chosenTopic],
      allowRepeats: true
    })
  });

  const createBody = await readJsonSafe(createRes);
  if (!createRes.ok) {
    console.error("Create failed", createRes.status, createBody.text);
    process.exit(1);
  }

  const worksheetId = createBody.json?.data?.worksheetId;
  console.log("Created worksheetId", worksheetId);
  if (!worksheetId) {
    console.error("Create succeeded but worksheetId missing", createBody.json);
    process.exit(1);
  }

  console.log("Starting/resuming attempt...");
  const attemptRes = await fetch(`${BASE_URL}/student/worksheets/${worksheetId}/attempts/start`, {
    method: "POST",
    headers
  });

  const attemptBody = await readJsonSafe(attemptRes);
  console.log("Attempt status", attemptRes.status);
  console.log(attemptBody.json || attemptBody.text);

  if (!attemptRes.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
