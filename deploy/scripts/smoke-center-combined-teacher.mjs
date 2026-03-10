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
  const token = await login("CE001", process.env.CENTER_PASSWORD || "Pass@123");

  const cyclesRes = await fetch(`${base}/api/exam-cycles?limit=5&offset=0`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const cyclesJson = await asJson(cyclesRes);
  const cycles = cyclesJson?.data?.items || [];

  if (cycles.length === 0) {
    console.log("No exam cycles.");
    return;
  }

  const report = [];

  for (const cycle of cycles) {
    const cycleId = cycle.id;

    const prepRes = await fetch(`${base}/api/exam-cycles/${cycleId}/center-list/prepare`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    const prepJson = await asJson(prepRes);
    const items = prepJson?.data?.items || [];

    let entriesWithTeacherField = 0;
    let entriesWithTeacherValue = 0;
    let sample = null;

    for (const item of items) {
      const entry = item?.entry;
      if (!entry) continue;
      if (Object.prototype.hasOwnProperty.call(entry, "sourceTeacherUser")) {
        entriesWithTeacherField += 1;
      }

      const teacher = entry?.sourceTeacherUser;
      if (teacher) {
        entriesWithTeacherValue += 1;
        if (!sample) {
          sample = {
            teacherUsername: teacher.username || null,
            teacherName: teacher.teacherProfile ? teacher.teacherProfile.fullName : null
          };
        }
      }
    }

    const firstEntry = items?.[0]?.entry || null;
    report.push({
      cycleId,
      totalItems: items.length,
      entriesWithTeacherField,
      entriesWithTeacherValue,
      firstEntryHasTeacherField:
        firstEntry && Object.prototype.hasOwnProperty.call(firstEntry, "sourceTeacherUser"),
      sample
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
