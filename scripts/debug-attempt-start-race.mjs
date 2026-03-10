const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4000/api";

async function readJsonSafe(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

async function login() {
  const tenantCode = process.env.TENANT_CODE || "DEFAULT";
  const username = process.env.AUTH_USERNAME || "ST0001";
  const password = process.env.PASSWORD || "Pass@123";

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantCode, username, password })
  });

  const body = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(`Login failed ${res.status}: ${body.text}`);
  }

  const token = body.json?.data?.access_token;
  if (!token) {
    throw new Error("Login ok but access_token missing");
  }

  return token;
}

async function main() {
  const token = await login();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // Create a small auto practice worksheet.
  const createRes = await fetch(`${BASE_URL}/student/abacus-practice-worksheets`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      timeLimitSeconds: 600,
      termCount: 3,
      digitsMode: 3,
      operations: ["ADD"],
      totalQuestions: 5
    })
  });

  const createBody = await readJsonSafe(createRes);
  if (!createRes.ok) {
    throw new Error(`Create failed ${createRes.status}: ${createBody.text}`);
  }

  const worksheetId = createBody.json?.data?.worksheetId;
  if (!worksheetId) {
    throw new Error("Create ok but worksheetId missing");
  }

  const url = `${BASE_URL}/student/worksheets/${worksheetId}/attempts/start`;

  // Fire two concurrent calls to simulate StrictMode/double-mount.
  const [a, b] = await Promise.all([
    fetch(url, { method: "POST", headers }),
    fetch(url, { method: "POST", headers })
  ]);

  const [ab, bb] = await Promise.all([readJsonSafe(a), readJsonSafe(b)]);

  console.log("A", a.status, ab.json || ab.text);
  console.log("B", b.status, bb.json || bb.text);

  if (!a.ok || !b.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
