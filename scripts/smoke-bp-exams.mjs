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

async function main() {
  const token = await login("BP001", process.env.BP_PASSWORD || "Pass@123");

  const cyclesRes = await fetch(`${base}/api/exam-cycles?limit=10&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const cyclesJson = await asJson(cyclesRes);
  const cycles = cyclesJson?.data?.items || [];
  const cycleId = cycles[0]?.id;

  console.log("cycleId:", cycleId || "<none>");
  if (!cycleId) return;

  const pendingRes = await fetch(`${base}/api/exam-cycles/${cycleId}/enrollment-lists/pending`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const pendingJson = await asJson(pendingRes);
  const pending = Array.isArray(pendingJson.data) ? pendingJson.data : [];

  console.log("pending:", pendingRes.status, pendingJson.success, "count=", pending.length);

  if (!pending.length) return;

  const listId = pending[0].id;
  const fwRes = await fetch(`${base}/api/exam-cycles/${cycleId}/enrollment-lists/${listId}/forward`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const fwJson = await asJson(fwRes);

  console.log("forward:", fwRes.status, fwJson.success, fwJson?.data?.status || null);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
