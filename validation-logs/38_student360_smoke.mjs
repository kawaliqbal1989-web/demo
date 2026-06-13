const base = 'http://127.0.0.1:4000/api';

async function req(path, init = {}) {
  const r = await fetch(base + path, init);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, ok: r.ok, path, bodyText: text, bodyJson: json };
}

const run = async () => {
  const login = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantCode: 'DEFAULT', username: 'CE001', password: 'Pass@123' })
  });

  if (!login.ok) {
    console.log(JSON.stringify({ step: 'login_failed', login }, null, 2));
    process.exit(1);
  }

  const token = login.bodyJson?.data?.access_token;
  const students = await req('/center/students?limit=20&offset=0', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const items = students.bodyJson?.data?.items || students.bodyJson?.data || [];
  const first = Array.isArray(items) ? items.find(Boolean) : null;
  const studentId = first?.id || first?.studentId;

  if (!studentId) {
    console.log(JSON.stringify({ step: 'no_student_found', students }, null, 2));
    process.exit(2);
  }

  const profile360 = await req(`/center/students/${studentId}/360`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log(JSON.stringify({
    login: { status: login.status, ok: login.ok },
    students: { status: students.status, ok: students.ok, foundStudentId: studentId },
    student360: {
      status: profile360.status,
      ok: profile360.ok,
      path: profile360.path,
      message: profile360.bodyJson?.message || null,
      hasStudentBlock: Boolean(profile360.bodyJson?.data?.student)
    }
  }, null, 2));
};

run().catch((e) => {
  console.error(e);
  process.exit(99);
});
