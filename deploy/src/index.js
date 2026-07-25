/* ============================================================
   Deadhead — Cloudflare Worker: accounts + cloud saves
   Everything else (the whole simulation) runs in the browser.
   This file only does auth and moves ~2 KB of JSON per request.
   ============================================================ */

const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
const MAX_SAVE_BYTES = 256 * 1024;   // a real save is ~1–15 KB; this is abuse defence
const SESSION_DAYS = 30;
const MAX_FAILS = 8;                 // then a cooldown
const FAIL_WINDOW_MS = 15 * 60 * 1000;

/* ============================================================
   WHY THE PASSWORD KDF RUNS IN THE BROWSER

   The Workers FREE plan allows 10 ms of CPU per request. PBKDF2 at
   OWASP's recommended 210k iterations measures ~18.7 ms — so hashing
   server-side fails every register and login with Error 1102
   ("Worker exceeded resource limits"), which surfaces as an opaque
   error rather than anything pointing at the cause. Measured:

       210,000 iters -> 18.7 ms   over budget
       100,000 iters ->  8.9 ms   no headroom
        50,000 iters ->  4.5 ms   fits, but weaker than advised
       1x SHA-256    ->  0.16 ms  what we do now

   So the work moves to the client, which has CPU to spare:

       browser:  authKey = PBKDF2-SHA256(password,
                             "deadhead|" + email, KDF_ITERS) -> 32 bytes
       server:   stored  = SHA-256(authKey + per-user salt)

   Preserved: the server never sees the password, and a stolen database
   still forces an attacker back through KDF_ITERS PBKDF2 iterations per
   guess — the same wall as before.

   Given up: in transit the derived key IS the credential, so this rests
   entirely on TLS, and the minimum-length rule is now enforced in the
   browser where a determined user could bypass it (weakening only their
   own account). Acceptable for a game; not for a bank.
   ============================================================ */
const KDF_ITERS = 250000;            // the browser must use this exact value
const KDF_PREFIX = 'deadhead|';      // salt = KDF_PREFIX + lowercased email

/* ---------------- helpers ---------------- */
const enc = new TextEncoder();
const now = () => Date.now();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}
const bad = (msg, status = 400) => json({ error: msg }, status);

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/* Comparison that does not leak position of the first mismatch. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* One SHA-256 over (authKey + salt). Microseconds, not milliseconds. */
async function sha256raw(str) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}
async function hashAuthKey(authKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256raw(authKey + b64(salt));
  return `sha256$${KDF_ITERS}$${b64(salt)}$${b64(hash)}`;
}
async function verifyAuthKey(authKey, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4) return false;
  if (parts[0] === 'pbkdf2') return false;   // legacy rows: see note in verifyStoredFormat
  if (parts[0] !== 'sha256') return false;
  const hash = await sha256raw(authKey + parts[2]);
  return timingSafeEqual(hash, unb64(parts[3]));
}
/* A row written by the old server-side-PBKDF2 build can never authenticate
   now, because the browser sends a derived key rather than the password.
   Detect it and say so plainly instead of returning "wrong password". */
const isLegacyRow = (stored) => String(stored).startsWith('pbkdf2$');

/* The client sends 32 bytes of PBKDF2 output, hex encoded. */
const isAuthKey = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const newId = () => crypto.randomUUID();
function newToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cookieHeader(token, maxAgeSec) {
  const bits = [
    `dh_session=${token}`,
    'Path=/',
    'HttpOnly',           // JS cannot read it, so XSS cannot exfiltrate the session
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  return bits.join('; ');
}
function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/* ---------------- validation ---------------- */
function checkEmail(v) {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return null;
  // deliberately loose: the only authority on deliverability is delivery
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(e)) return null;
  return e;
}
/* Minimum length is enforced in the browser now — the server only ever
   sees the derived key, so it cannot judge the password behind it. */
function checkAuthKey(v) {
  if (!isAuthKey(v)) return 'bad credential format — hard-reload the page and retry';
  return null;
}

/* ---------------- sessions ---------------- */
async function currentUser(request, env) {
  const token = readCookie(request, 'dh_session');
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.user_id AS uid, s.expires AS exp, u.email AS email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(await sha256hex(token)).first();
  if (!row) return null;
  if (row.exp < now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256hex(token)).run();
    return null;
  }
  return { id: row.uid, email: row.email };
}

async function startSession(env, userId) {
  const token = newToken();
  const ms = SESSION_DAYS * 86400 * 1000;
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?,?,?,?)'
  ).bind(await sha256hex(token), userId, now(), now() + ms).run();
  // opportunistic cleanup — no cron needed
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()).run();
  return { token, maxAge: Math.floor(ms / 1000) };
}

/* ---------------- login throttle ---------------- */
async function throttled(env, email) {
  const row = await env.DB.prepare('SELECT fails, last FROM login_attempts WHERE email = ?')
    .bind(email).first();
  if (!row) return false;
  if (now() - row.last > FAIL_WINDOW_MS) return false;
  return row.fails >= MAX_FAILS;
}
async function noteFail(env, email) {
  await env.DB.prepare(
    `INSERT INTO login_attempts (email, fails, last) VALUES (?, 1, ?)
     ON CONFLICT(email) DO UPDATE SET
       fails = CASE WHEN ? - login_attempts.last > ? THEN 1 ELSE login_attempts.fails + 1 END,
       last  = ?`
  ).bind(email, now(), now(), FAIL_WINDOW_MS, now()).run();
}
const clearFails = (env, email) =>
  env.DB.prepare('DELETE FROM login_attempts WHERE email = ?').bind(email).run();

/* ---------------- routes ---------------- */
async function handleApi(request, env, url) {
  const p = url.pathname;
  const method = request.method.toUpperCase();

  /* --- KDF parameters ---
     Public by design: the iteration count is not a secret, and the browser
     needs it before it can derive a key to log in with. */
  if (p === '/api/params' && method === 'GET') {
    return json({ kdfIters: KDF_ITERS, saltPrefix: KDF_PREFIX });
  }

  /* --- register --- */
  if (p === '/api/register' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return bad('malformed request');
    const email = checkEmail(body.email);
    if (!email) return bad('that does not look like an email address');
    const keyErr = checkAuthKey(body.authKey);
    if (keyErr) return bad(keyErr);

    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
    if (exists) return bad('that email is already registered', 409);

    const id = newId();
    try {
      await env.DB.prepare('INSERT INTO users (id, email, pw, created, last_seen) VALUES (?,?,?,?,?)')
        .bind(id, email, await hashAuthKey(body.authKey), now(), now()).run();
    } catch (err) {
      // UNIQUE violation: another request registered this email between the
      // SELECT above and this INSERT.
      if (/UNIQUE/i.test(String(err && err.message))) {
        return bad('that email is already registered', 409);
      }
      throw err;
    }

    const { token, maxAge } = await startSession(env, id);
    return json({ email }, 201, { 'set-cookie': cookieHeader(token, maxAge) });
  }

  /* --- login --- */
  if (p === '/api/login' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return bad('malformed request');
    const email = checkEmail(body.email);
    if (!email || !isAuthKey(body.authKey)) return bad('email and password required');

    if (await throttled(env, email)) {
      return bad('too many failed attempts — wait 15 minutes', 429);
    }
    const user = await env.DB.prepare('SELECT id, pw FROM users WHERE email = ?').bind(email).first();

    if (user && isLegacyRow(user.pw)) {
      return bad('this account predates a security change and must be recreated — ' +
        'delete the row from the users table, or register again with a different email', 409);
    }

    // Same generic message and comparable work either way, so the response
    // does not reveal whether the address is registered.
    const ok = user
      ? await verifyAuthKey(body.authKey, user.pw)
      : await verifyAuthKey(body.authKey, `sha256$${KDF_ITERS}$${b64(new Uint8Array(16))}$${b64(new Uint8Array(32))}`);
    if (!user || !ok) {
      await noteFail(env, email);
      return bad('wrong email or password', 401);
    }

    await clearFails(env, email);
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now(), user.id).run();
    const { token, maxAge } = await startSession(env, user.id);
    return json({ email }, 200, { 'set-cookie': cookieHeader(token, maxAge) });
  }

  /* --- logout --- */
  if (p === '/api/logout' && method === 'POST') {
    const token = readCookie(request, 'dh_session');
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(await sha256hex(token)).run();
    }
    return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
  }

  /* --- who am I --- */
  if (p === '/api/me' && method === 'GET') {
    const user = await currentUser(request, env);
    return json({ email: user ? user.email : null });
  }

  /* everything past here needs a session */
  const user = await currentUser(request, env);
  if (!user) return bad('not signed in', 401);

  /* --- list slots (metadata only, so the UI stays cheap) --- */
  if (p === '/api/saves' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT slot, version, ts, day, cash, cars, clock FROM saves WHERE user_id = ?'
    ).bind(user.id).all();
    const out = {};
    for (const s of SLOTS) out[s] = null;
    for (const r of results || []) {
      out[r.slot] = { v: r.version, ts: r.ts, meta: { day: r.day, cash: r.cash, cars: r.cars, clock: r.clock } };
    }
    return json(out);
  }

  /* --- one slot: read / write / delete --- */
  const m = p.match(/^\/api\/save\/([A-Za-z0-9_-]{1,16})$/);
  if (m) {
    const slot = m[1];
    if (!SLOTS.includes(slot)) return bad('unknown slot');

    if (method === 'GET') {
      const row = await env.DB.prepare(
        'SELECT payload FROM saves WHERE user_id = ? AND slot = ?'
      ).bind(user.id, slot).first();
      if (!row) return json(null);
      return new Response(row.payload, {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    if (method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_SAVE_BYTES) return bad('save too large', 413);
      let save;
      try { save = JSON.parse(text) } catch { return bad('save is not valid JSON') }
      if (!save || typeof save !== 'object' || !save.s || typeof save.v !== 'number') {
        return bad('not a Deadhead save');
      }
      const meta = save.meta || {};
      await env.DB.prepare(
        `INSERT INTO saves (user_id, slot, version, ts, day, cash, cars, clock, payload)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, slot) DO UPDATE SET
           version=excluded.version, ts=excluded.ts, day=excluded.day,
           cash=excluded.cash, cars=excluded.cars, clock=excluded.clock,
           payload=excluded.payload`
      ).bind(
        user.id, slot, save.v, Number(save.ts) || now(),
        Number(meta.day) || null, Number(meta.cash) || null,
        Number(meta.cars) || null, typeof meta.clock === 'string' ? meta.clock : null,
        text
      ).run();
      return json({ ok: true });
    }

    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM saves WHERE user_id = ? AND slot = ?')
        .bind(user.id, slot).run();
      return json({ ok: true });
    }
    return bad('method not allowed', 405);
  }

  return bad('no such endpoint', 404);
}

/* ---------------- entry ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // Same-origin only. The cookie is SameSite=Lax, and we additionally
      // reject cross-origin writes rather than relying on that alone.
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) {
        return bad('cross-origin requests are not allowed', 403);
      }
      // Without a D1 binding the game still works on local browser saves,
      // so say that rather than throwing an opaque 500.
      if (!env.DB) {
        return bad('accounts are not configured on this deployment — the D1 ' +
          'binding is missing. Local browser saves still work.', 503);
      }

      try {
        return await handleApi(request, env, url);
      } catch (err) {
        const msg = String((err && err.message) || err);
        // The overwhelmingly likely first-deploy failure: schema never applied.
        if (/no such table/i.test(msg)) {
          return bad('database tables are missing — run schema.sql against the ' +
            'D1 database, then reload', 503);
        }
        console.error('api error', url.pathname, err && err.stack || err);
        return bad('server error', 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
