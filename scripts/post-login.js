import fetch from 'node-fetch';

async function post() {
  try {
    const res = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantCode: 'DEFAULT', email: 'superadmin@abacusweb.local', password: 'Pass@123' })
    });
    const text = await res.text();
    console.log('Status', res.status);
    console.log('Headers', Object.fromEntries(res.headers.entries()));
    console.log('Body:', text);
  } catch (err) {
    console.error('Fetch error', err);
  }
}

post();
