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
  if (!body.success) throw new Error(`Login failed: ${body.error_code} ${body.message}`);
  return body.data.access_token;
}

async function main() {
  const token = await login("CE001", process.env.CENTER_PASSWORD || "Pass@123");

  const cyclesRes = await fetch(`${base}/api/exam-cycles?limit=5&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const cyclesJson = await asJson(cyclesRes);
  const cycleId = cyclesJson?.data?.items?.find(Boolean)?.id;
  if (!cycleId) throw new Error("No exam cycles found");

  const prepRes = await fetch(`${base}/api/exam-cycles/${cycleId}/center-list/prepare`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const prepJson = await asJson(prepRes);
  const first = prepJson?.data?.items?.find((x) => x?.entryId) || null;
  if (!first) {
    console.log(JSON.stringify({ cycleId, message: "No combined list items" }, null, 2));
    return;
  }

  const entryId = first.entryId;
  const current = first.included !== false;
  const nextIncluded = !current;

  const patchRes = await fetch(`${base}/api/exam-cycles/${cycleId}/center-list/items/${entryId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ included: nextIncluded })
  });
  const patchJson = await asJson(patchRes);

  console.log(
    JSON.stringify(
      {
        cycleId,
        entryId,
        toggledTo: nextIncluded,
        apiSuccess: patchJson?.success,
        data: patchJson?.data
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
