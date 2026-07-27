/* ============================================================
   Deadhead — Cloudflare Worker: accounts + cloud saves
   Everything else (the whole simulation) runs in the browser.
   This file only does auth and moves ~2 KB of JSON per request.
   ============================================================ */

/* Gitignored — never committed, this repo is public. See
   admin-config.example.js for the template, isAdmin() below for how it's
   used, and .gitignore for the exclusion. If this import fails at deploy
   time, you haven't created your copy yet: cp admin-config.example.js
   admin-config.js and fill in your own email/password. */
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './admin-config.js';

const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];
const MAX_SAVE_BYTES = 256 * 1024;   // a real save is ~1–15 KB; this is abuse defence

/* CATALOG ids from deadhead.html's CATALOG const, copied rather than shared
   — this Worker has no import path back into the game engine, and the list
   changes rarely enough that a copy is cheaper than building one. Used only
   to whitelist body.models on the way into `stats` (see /api/stat below);
   admin.html keeps its OWN copy (name/badge/photo) for rendering the Cars
   view, since that file never touches the server's module graph either. */
const MODEL_IDS = ['cybercab','model3','modely','model3prem','modelyprem',
  'modelyl','model3perf','modelyperf','cybertruck'];

/* The achievement catalogue, id-only — the same copy-not-import trade as
   MODEL_IDS above. Names, hints and predicates live in deadhead.html's ACHV
   table (which is the authority); this list exists purely to whitelist what
   a client may write into stats.achv, and admin.html keeps its own id->name
   map for rendering. Keep all three in sync when adding an achievement; the
   cost of drift is an unlabelled row in one admin view, not a broken game. */
const ACHV_IDS = [
  'first-car','first-ride','first-shift',
  'black','net-500','net-1500','cash-10k',
  'clean-sheet','safety-95','under-review','meter-runner',
  'fleet-3','fleet-5','purpose-built','why-a-truck',
  'repossessed','comeback',
  'out-of-austin','grand-tour',
  'found-the-switch','hands-on',
];

/* ---- leaderboard plausibility ----
   /api/stat is unauthenticated and every number in it is client-supplied,
   so the board has to assume the payload is hostile. These are not balance
   numbers, they are impossibility bounds: a legitimate shift cannot get
   near them, so nothing real is ever excluded. See lbPlausible(). */
const LB_MAX_NET = 50000;       // 18h demand window x a huge fleet is < 30k gross
const LB_MAX_NET_PER_H = 5000;
const LB_TOP_N = 5;
const LB_CACHE_S = 60;

const SESSION_DAYS = 30;
const MAX_FAILS = 8;                 // then a cooldown
const FAIL_WINDOW_MS = 15 * 60 * 1000;

/* ============================================================
   TELEMETRY (onboardingplan.md §4)

   POST /api/stat is unauthenticated by design — a local profile uuid is not
   an account, and requiring one would put a login back in front of a game
   that deliberately has none. Three consequences accepted up front (see the
   plan): writes can't be authenticated, only the deployed build reports
   (deadhead.html has no cloud.js), and this can never be allowed to affect
   play, which is why the client wraps it in .catch(function(){}) with no
   await in the shift-end path.

   Mitigations here, since a write cannot be authenticated: a strict body
   size cap, a per-(player, IP) rate limit, and server-side clamping of
   every numeric field to a sane range. This makes the data useful for
   spotting tuning problems; it does not make it trustworthy enough to
   call a leaderboard. */
const MAX_STAT_BYTES = 8 * 1024;
const STAT_MAX_PER_WINDOW = 30;
const STAT_WINDOW_MS = 60 * 60 * 1000;   // 1 hour — a real player files a few shifts/hour
/* Cap on distinct buckets held in memory at once, so the map cannot grow
   without bound inside a long-lived isolate. Well above any real
   concurrent-player count per isolate; when it is hit the map is dropped
   wholesale rather than evicted cleverly, which costs a forgotten window
   and nothing else. */
const STAT_BUCKET_CAP = 5000;

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

   The comment above still says "email" in the worked example — the KDF
   salt is built the same way from whatever string identifies the account,
   and that string changed from an email address to a free-text username
   (Pavel's request: the player already types a display name on the intro
   screen, so asking for a second, email-shaped identifier for cloud saves
   was friction with no payoff — there was never a password-reset email to
   receive). Nothing about the KDF itself changed, only what gets hashed
   into the salt alongside it. */
const KDF_ITERS = 250000;            // the browser must use this exact value
const KDF_PREFIX = 'deadhead|';      // salt = KDF_PREFIX + lowercased username

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
/* Was checkEmail() — an @-and-domain format check. Now just a length/shape
   guard: a username is free text (the same value already typed as the
   player's display name, see PROFILE.name in deadhead.html), lowercased for
   case-insensitive uniqueness the same way the email column used to be. */
function checkUsername(v) {
  if (typeof v !== 'string') return null;
  const u = v.trim().toLowerCase();
  if (u.length < 1 || u.length > 40) return null;
  if (/[\x00-\x1f]/.test(u)) return null;   // no control characters
  return u;
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
    `SELECT s.user_id AS uid, s.expires AS exp, u.username AS username
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(await sha256hex(token)).first();
  if (!row) return null;
  if (row.exp < now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256hex(token)).run();
    return null;
  }
  return { id: row.uid, username: row.username };
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
async function throttled(env, username) {
  const row = await env.DB.prepare('SELECT fails, last FROM login_attempts WHERE username = ?')
    .bind(username).first();
  if (!row) return false;
  if (now() - row.last > FAIL_WINDOW_MS) return false;
  return row.fails >= MAX_FAILS;
}
async function noteFail(env, username) {
  await env.DB.prepare(
    `INSERT INTO login_attempts (username, fails, last) VALUES (?, 1, ?)
     ON CONFLICT(username) DO UPDATE SET
       fails = CASE WHEN ? - login_attempts.last > ? THEN 1 ELSE login_attempts.fails + 1 END,
       last  = ?`
  ).bind(username, now(), now(), FAIL_WINDOW_MS, now()).run();
}
const clearFails = (env, username) =>
  env.DB.prepare('DELETE FROM login_attempts WHERE username = ?').bind(username).run();

/* ---------------- telemetry helpers ---------------- */
/* Clamp a client-reported number into a plausible range rather than trusting
   it. Anything outside range, non-finite, or missing falls back to the
   default (usually 0) — an unauthenticated write should never be able to
   put a value in this table that a chart can't survive. */
function clampNum(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
function clampStr(v, max) {
  if (typeof v !== 'string') return null;
  return v.slice(0, max);
}
/* body.models -> a clean { modelId: {gross,cost,miles,rides}, ... } string,
   or null. Rejects anything not a plain object (arrays included — that was
   the OLD shape, from before the per-model rework; see the comment above
   its call site), drops any key not in MODEL_IDS, caps at 20 entries (a
   fleet this large would already be against every city's cap), and clamps
   every number the same way the flat stats columns do. */
function sanitizeModels(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  let n = 0;
  for (const k of Object.keys(v)) {
    if (n >= 20) break;
    if (!MODEL_IDS.includes(k)) continue;
    const m = v[k];
    if (!m || typeof m !== 'object') continue;
    out[k] = {
      gross: clampNum(m.gross, -1e9, 1e9, 0),
      cost: clampNum(m.cost, -1e9, 1e9, 0),
      miles: clampNum(m.miles, 0, 1e7, 0),
      rides: clampNum(m.rides, 0, 100000, 0),
    };
    n++;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}
/* The player's cumulative achievement ids, whitelisted and deduped. Sent in
   full on every shift rather than as a delta: the list is bounded by the
   catalogue (~20 short ids, well under 500 bytes) and a full list means the
   admin unlock-rate query is a plain DISTINCT over the newest rows instead
   of a replay of every delta a player ever sent. Unknown ids are dropped
   silently — an old client that knows an achievement this Worker does not
   is a deploy-order artefact, not an error worth failing a shift over. */
function sanitizeAchv(v) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const id of v) {
    if (typeof id !== 'string') continue;
    if (!ACHV_IDS.includes(id)) continue;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= ACHV_IDS.length) break;
  }
  return out.length ? JSON.stringify(out) : null;
}
/* Best-effort client IP for the throttle bucket. Cloudflare always sets
   CF-Connecting-IP in production; the fallback just means local/dev testing
   shares one bucket, which is fine — it is a throttle, not an audit log. */
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}
/* THE /api/stat THROTTLE, AND WHY IT NO LONGER TOUCHES D1.

   This used to be a `stat_attempts` table: a SELECT plus an INSERT/UPDATE
   on every call, mirroring the login_attempts pattern. It worked, but it
   defended the write budget by spending it — D1's free plan allows 100,000
   rows written per day, and this made every LEGITIMATE shift report pay a
   second write purely to be told it was allowed. On the hottest write path
   in the app, that is the wrong trade.

   It is now an in-memory map, local to one Worker isolate. Understand what
   that does and does not give you:

   - It is NOT global. Cloudflare runs many isolates across many colos, and
     each keeps its own counters, so the effective ceiling is the limit
     times however many isolates a client's traffic lands on. It also
     resets whenever an isolate is recycled.
   - It IS enough for the case actually worth defending against here: a
     stuck client retry loop or a single runaway tab, which stays on one
     connection and hits one isolate. That was always the realistic threat
     — the table could never stop a distributed abuser either.
   - The real backstop is a Cloudflare Rate Limiting rule on /api/stat
     (Security > WAF > Rate limiting rules; the free plan includes one).
     That runs at the edge BEFORE the Worker is invoked, so a flood costs
     neither a request nor a row — strictly better than anything that can
     be done in here, at any price. See schema.sql for the exact rule.

   Anything a throttle here would have caught and this misses still lands
   in a table whose every numeric column is clamped, so the downside of a
   miss is a junk row, not a broken query. */
const statBuckets = new Map();   // `${playerId}|${ip}` -> { n, start }

function statThrottled(playerId, ip) {
  const key = `${playerId}|${ip}`;
  const nowMs = now();
  // Cheap unbounded-growth guard; see STAT_BUCKET_CAP.
  if (statBuckets.size > STAT_BUCKET_CAP) statBuckets.clear();
  const b = statBuckets.get(key);
  if (!b || nowMs - b.start > STAT_WINDOW_MS) {
    statBuckets.set(key, { n: 1, start: nowMs });
    return false;
  }
  if (b.n >= STAT_MAX_PER_WINDOW) return true;
  b.n++;
  return false;
}

/* ---------------- admin gate ----------------
   Was a Wrangler secret (ADMIN_TOKEN); replaced with a hardcoded
   email+password pair per Pavel's request — the wrangler secret/login
   dance was more ceremony than the admin panel is worth. The credentials
   live in src/admin-config.js, which is gitignored (this repo is public)
   and never committed — see admin-config.example.js for the template and
   .gitignore for the exclusion. `wrangler deploy` still bundles the real
   file straight into the Worker even though git ignores it.

   Both sides are hashed before comparison so it stays constant-time
   regardless of what a prober sends, same discipline as the session-token
   checks above. A missing/mismatched pair returns 404, not 401/403, so a
   probe cannot even confirm the endpoint exists (onboardingplan.md §4). */
async function isAdmin(request) {
  const email = request.headers.get('x-admin-email');
  const password = request.headers.get('x-admin-password');
  if (!email || !password) return false;
  const [a1, a2, b1, b2] = await Promise.all([
    sha256raw(email.trim().toLowerCase()), sha256raw(ADMIN_EMAIL.trim().toLowerCase()),
    sha256raw(password), sha256raw(ADMIN_PASSWORD)
  ]);
  return timingSafeEqual(a1, a2) && timingSafeEqual(b1, b2);
}

/* ---------------- the leaderboard ----------------

   WHAT THIS BOARD CAN AND CANNOT PROMISE.

   /api/stat is unauthenticated and every number in it is client-supplied.
   That was fine while the telemetry was a private tuning signal — the
   schema comment says so in as many words, "not trustworthy enough to call
   a leaderboard". Publishing it changes the incentive completely: a public
   number is a thing people try to beat, and the cheapest way to beat it is
   one curl.

   Three things narrow the gap, none of which closes it:

   1. SIGNED-IN ONLY. `user_id` is stamped server-side from the dh_session
      cookie, never read from the body, so an entry requires a real
      registered account. That does not stop a determined person, but it
      turns a drive-by curl into deliberate account creation, and it gives
      a name to remove when someone does.
   2. INTERNAL CONSISTENCY. A row must satisfy net = gross - cost and carry
      real miles, rides and hours. A spoofer who POSTs `{net: 9e9}` and
      nothing else fails this without any judgement call about balance.
   3. IMPOSSIBILITY BOUNDS. LB_MAX_NET / LB_MAX_NET_PER_H are not tuning
      values; they sit far above what the fare model can physically produce
      in an 18-hour demand window, so a legitimate shift is never excluded.

   What remains possible: a registered player who forges an internally
   consistent, individually plausible row. Accept that. This is a game
   about a robotaxi fleet, the prize is a name on a list, and the honest
   framing is the one the UI uses — "best reported shift", not "world
   record". If it does get abused, the fix is a takedown of one username,
   not an anti-cheat system. */
function lbPlausible() {
  return `s.user_id IS NOT NULL
      AND s.net IS NOT NULL AND s.net > 0 AND s.net <= ${LB_MAX_NET}
      AND s.gross IS NOT NULL AND s.cost IS NOT NULL
      AND ABS(s.net - (s.gross - s.cost)) <= 1
      AND s.worked_h IS NOT NULL AND s.worked_h >= 0.05 AND s.worked_h <= 24
      AND s.net <= s.worked_h * ${LB_MAX_NET_PER_H}
      AND s.rides IS NOT NULL AND s.rides >= 1
      AND s.miles IS NOT NULL AND s.miles > 0`;
}

/* ---------------- routes ---------------- */
async function handleApi(request, env, url, ctx) {
  const p = url.pathname;
  const method = request.method.toUpperCase();

  /* --- KDF parameters ---
     Public by design: the iteration count is not a secret, and the browser
     needs it before it can derive a key to log in with. */
  if (p === '/api/params' && method === 'GET') {
    return json({ kdfIters: KDF_ITERS, saltPrefix: KDF_PREFIX });
  }

  /* --- the public leaderboard ---
     Best single-shift net per city. Public and unauthenticated: it is the
     one thing in here a player is shown without an account, and gating it
     behind one would defeat the point of putting it in the game.

     CACHED AT THE EDGE, and that is not an optimisation. This query scans
     the whole stats table, and it is the only endpoint every player polls
     rather than one they occasionally hit — uncached, a Reddit spike turns
     one full scan per player per panel-open into the largest D1 read load
     in the app by a wide margin. A 60-second cache collapses all of that
     into one scan a minute globally, and nobody watching a leaderboard can
     tell the difference between live and a minute old. */
  if (p === '/api/leaderboard' && method === 'GET') {
    const cache = caches.default;
    // Normalised key: the cached entry must not fork on query strings or
    // on the request's own headers.
    const cacheKey = new Request(url.origin + '/api/leaderboard', { method: 'GET' });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const { results } = await env.DB.prepare(
      `SELECT city, username, net, ts, rides, worked_h AS workedH FROM (
         SELECT s.city AS city, u.username AS username, s.net AS net,
                s.ts AS ts, s.rides AS rides, s.worked_h AS worked_h,
                ROW_NUMBER() OVER (
                  PARTITION BY s.city ORDER BY s.net DESC, s.ts ASC
                ) AS rn
           FROM stats s
           JOIN users u ON u.id = s.user_id
          WHERE ${lbPlausible()}
       )
       WHERE rn <= ${LB_TOP_N}
       ORDER BY city, net DESC`
    ).all();

    /* Grouped server-side so the client renders a map rather than
       re-deriving one, and so the city list on the board is whatever the
       data actually contains — same discipline as the funnel above, no
       second copy of the city order living in a file that will not be
       updated when city #6 ships. */
    const byCity = {};
    for (const r of (results || [])) {
      (byCity[r.city] || (byCity[r.city] = [])).push({
        username: r.username, net: r.net, ts: r.ts,
        rides: r.rides, workedH: r.workedH,
      });
    }

    const res = json({ metric: 'best-shift-net', top: LB_TOP_N, cities: byCity });
    /* s-maxage drives the edge cache; the short max-age keeps a browser
       from re-asking on every panel open within the same minute. */
    res.headers.set('cache-control', `public, max-age=30, s-maxage=${LB_CACHE_S}`);
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  /* --- register --- */
  if (p === '/api/register' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return bad('malformed request');
    const username = checkUsername(body.username);
    if (!username) return bad('enter a username');
    const keyErr = checkAuthKey(body.authKey);
    if (keyErr) return bad(keyErr);

    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
    if (exists) return bad('that username is already taken', 409);

    const id = newId();
    try {
      await env.DB.prepare('INSERT INTO users (id, username, pw, created, last_seen) VALUES (?,?,?,?,?)')
        .bind(id, username, await hashAuthKey(body.authKey), now(), now()).run();
    } catch (err) {
      // UNIQUE violation: another request registered this username between
      // the SELECT above and this INSERT.
      if (/UNIQUE/i.test(String(err && err.message))) {
        return bad('that username is already taken', 409);
      }
      throw err;
    }

    const { token, maxAge } = await startSession(env, id);
    return json({ username }, 201, { 'set-cookie': cookieHeader(token, maxAge) });
  }

  /* --- login --- */
  if (p === '/api/login' && method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return bad('malformed request');
    const username = checkUsername(body.username);
    if (!username || !isAuthKey(body.authKey)) return bad('username and password required');

    if (await throttled(env, username)) {
      return bad('too many failed attempts — wait 15 minutes', 429);
    }
    const user = await env.DB.prepare('SELECT id, pw FROM users WHERE username = ?').bind(username).first();

    if (user && isLegacyRow(user.pw)) {
      return bad('this account predates a security change and must be recreated — ' +
        'delete the row from the users table, or register again with a different username', 409);
    }

    // Same generic message and comparable work either way, so the response
    // does not reveal whether the username is registered.
    const ok = user
      ? await verifyAuthKey(body.authKey, user.pw)
      : await verifyAuthKey(body.authKey, `sha256$${KDF_ITERS}$${b64(new Uint8Array(16))}$${b64(new Uint8Array(32))}`);
    if (!user || !ok) {
      await noteFail(env, username);
      return bad('wrong username or password', 401);
    }

    await clearFails(env, username);
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now(), user.id).run();
    const { token, maxAge } = await startSession(env, user.id);
    return json({ username }, 200, { 'set-cookie': cookieHeader(token, maxAge) });
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
    return json({ username: user ? user.username : null });
  }

  /* --- telemetry: one row per finished shift, unauthenticated ---
     onboardingplan.md §4. If a valid dh_session cookie happens to be
     present, the row is stamped with user_id at no extra cost (one lookup
     already in currentUser) — worth doing, not required. */
  if (p === '/api/stat' && method === 'POST') {
    const text = await request.text();
    if (text.length > MAX_STAT_BYTES) return bad('payload too large', 413);
    let body;
    try { body = JSON.parse(text) } catch { return bad('malformed request') }
    if (!body || typeof body !== 'object') return bad('malformed request');

    const playerId = clampStr(body.playerId, 64);
    if (!playerId) return bad('playerId required');

    if (statThrottled(playerId, clientIp(request))) {
      // Quiet failure — a throttled client should not retry harder. 202,
      // not an error status, so it does not look actionable to a client
      // that only checks response.ok.
      return json({ ok: true }, 202);
    }

    const sessionUser = await currentUser(request, env).catch(() => null);

    // `models` used to be a flat, deduped array of model ids present in the
    // fleet — replaced with a real per-model breakdown (Pavel: the flat
    // version made every model in a mixed fleet show IDENTICAL numbers in
    // admin's Cars view, since the whole shift's economics were attributed
    // to each one). Shape is now { modelId: {gross,cost,miles,rides}, ... },
    // built client-side from each car's own per-shift ledger — see
    // appendHistoryRow()'s perModel build in deadhead.html. Whitelisted
    // against the known catalogue and every number clamped, same discipline
    // as every other field here: an unauthenticated writer should never be
    // able to put something in this column that json_each()/json_extract()
    // downstream can't survive.
    const models = sanitizeModels(body.models);
    const achv = sanitizeAchv(body.achv);

    await env.DB.prepare(
      `INSERT INTO stats (
         player_id, user_id, name, created, ts,
         city, day, shift_no, permit,
         worked_h, billed_h,
         gross, commission, cost, net,
         energy, dep, maint, ins, soft, fixed,
         miles, rides, cancels, safety,
         cash, cars, models, achv
       ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?)`
    ).bind(
      playerId,
      sessionUser ? sessionUser.id : null,
      clampStr(body.name, 24),
      clampNum(body.created, 0, 4102444800000, null),   // 0 .. year 2100
      now(),
      clampStr(body.city, 32),
      clampNum(body.day, 0, 100000, null),
      clampNum(body.shiftNo, 0, 100000, null),
      clampStr(body.permit, 32),
      clampNum(body.workedH, 0, 10000, null),
      clampNum(body.billedH, 0, 10000, null),
      clampNum(body.gross, -1e9, 1e9, null),
      clampNum(body.commission, -1e9, 1e9, null),
      clampNum(body.cost, -1e9, 1e9, null),
      clampNum(body.net, -1e9, 1e9, null),
      clampNum(body.energy, -1e9, 1e9, null),
      clampNum(body.dep, -1e9, 1e9, null),
      clampNum(body.maint, -1e9, 1e9, null),
      clampNum(body.ins, -1e9, 1e9, null),
      clampNum(body.soft, -1e9, 1e9, null),
      clampNum(body.fixed, -1e9, 1e9, null),
      clampNum(body.miles, 0, 1e7, null),
      clampNum(body.rides, 0, 100000, null),
      clampNum(body.cancels, 0, 100000, null),
      clampNum(body.safety, 0, 100, null),
      clampNum(body.cash, -1e9, 1e9, null),
      clampNum(body.cars, 0, 100000, null),
      models,
      achv
    ).run();

    return json({ ok: true }, 201);
  }

  /* --- admin: read-only aggregates, gated by a hardcoded email+password ---
     404, not 401/403, on a missing/wrong pair — see isAdmin() above. This
     check happens BEFORE anything else about the request is inspected, so
     an unauthorized prober learns nothing beyond "this path 404s". */
  if (p === '/api/admin/stats' && method === 'GET') {
    if (!(await isAdmin(request))) return bad('no such endpoint', 404);

    const view = url.searchParams.get('view') || 'players';

    if (view === 'players') {
      const { results } = await env.DB.prepare(
        `SELECT player_id, MAX(name) AS name, MAX(created) AS created,
                MIN(ts) AS first_seen, MAX(ts) AS last_seen,
                COUNT(*) AS shifts, COUNT(DISTINCT city) AS cities,
                MAX(cash) AS best_cash
           FROM stats
          GROUP BY player_id
          ORDER BY last_seen DESC
          LIMIT 500`
      ).all();
      return json({ view, rows: results || [] });
    }

    if (view === 'funnel') {
      /* THE CITY LIST IS DERIVED, NOT WRITTEN DOWN.

         This used to carry literal `CASE WHEN city = 'dallas'` and
         `= 'miami'` columns. Tampa and Orlando shipped afterwards and
         nobody came back here, so for two releases the funnel quietly
         claimed the game had three cities. Any list of cities kept in this
         file is a list that will be wrong again the next time one ships —
         so the cities now come out of the data, and city #6 appears in the
         admin the first time anybody files a shift there. */
      const row = await env.DB.prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN shift_no >= 1 THEN player_id END) AS shift1,
           COUNT(DISTINCT CASE WHEN shift_no >= 2 THEN player_id END) AS shift2,
           COUNT(DISTINCT CASE WHEN day >= 2 THEN player_id END) AS day2,
           COUNT(DISTINCT CASE WHEN day >= 5 THEN player_id END) AS day5,
           COUNT(DISTINCT CASE WHEN cars >= 2 THEN player_id END) AS fleet2,
           COUNT(DISTINCT CASE WHEN net > 0 THEN player_id END) AS profitable,
           COUNT(DISTINCT player_id) AS total
         FROM stats`
      ).first();
      /* Ordered by reach rather than by the game's own city order: the
         Worker does not know that order (it lives in CITIES in
         deadhead.html) and inventing a second copy of it here is the exact
         mistake being fixed above. Most-reached first reads as a funnel
         anyway, because a later city cannot outrank the one gating it. */
      const { results: cities } = await env.DB.prepare(
        `SELECT city, COUNT(DISTINCT player_id) AS players, COUNT(*) AS shifts
           FROM stats
          WHERE city IS NOT NULL AND city <> ''
          GROUP BY city
          ORDER BY players DESC, shifts DESC`
      ).all();
      return json({ view, row: row || {}, cities: cities || [] });
    }

    if (view === 'achievements') {
      /* Unlock rate per achievement. stats.achv holds the player's FULL
         cumulative list at the time of each shift, so COUNT(DISTINCT
         player_id) is the honest "how many people ever got this" without
         having to find each player's newest row first. */
      const { results } = await env.DB.prepare(
        `SELECT je.value AS id, COUNT(DISTINCT s.player_id) AS players
           FROM stats s, json_each(s.achv) je
          WHERE s.achv IS NOT NULL
            AND json_valid(s.achv)
            AND json_type(s.achv) = 'array'
          GROUP BY je.value
          ORDER BY players DESC`
      ).all();
      const total = await env.DB.prepare(
        `SELECT COUNT(DISTINCT player_id) AS n FROM stats`
      ).first();
      return json({ view, rows: results || [], totalPlayers: (total && total.n) || 0 });
    }

    if (view === 'economics') {
      /* Median, not mean — a handful of bankruptcy rows or a whale run
         would otherwise swing an average past what a typical shift looks
         like. Standard SQLite median trick: rank each row within its
         (city, shift_no) group and average the one or two middle ranks. */
      const { results } = await env.DB.prepare(
        `SELECT city, shift_no, AVG(net) AS median_net, COUNT(*) AS n
           FROM (
             SELECT city, shift_no, net,
                    ROW_NUMBER() OVER (PARTITION BY city, shift_no ORDER BY net) AS rn,
                    COUNT(*) OVER (PARTITION BY city, shift_no) AS cnt
               FROM stats
           )
          WHERE rn IN ((cnt + 1) / 2, (cnt + 2) / 2)
          GROUP BY city, shift_no
          ORDER BY city, shift_no`
      ).all();
      return json({ view, rows: results || [] });
    }

    if (view === 'cars') {
      /* `models` is a per-model breakdown, { modelId: {gross,cost,miles,rides}, ... }
         — one shift row can still name several models (a mixed fleet), so
         json_each() explodes it into one (row, model) pair per model
         present, same as before. What changed (Pavel's fix for identical
         numbers across models sharing a fleet): each model's own gross/cost/
         miles/rides now come from json_extract() on ITS OWN entry, not from
         the whole-shift stats.* columns — a Cybercab and a Model 3 in the
         same shift now genuinely diverge. avg_safety is the one exception,
         averaged from the shift-level stats.safety column because safety is
         an operator behaviour stat, not a per-vehicle one — there is nothing
         truer to attribute it to per model.

         json_type(s.models)='object' excludes rows written before this
         rework, when `models` was a flat JSON ARRAY of ids — json_each() on
         those would yield integer keys (0, 1, ...) instead of model ids, and
         this filters that legacy shape out cleanly rather than showing junk
         rows. Those old rows simply age out of the Cars view; they still
         count everywhere else (Players, funnel, economics, recent).

         Requires the SQLite JSON1 extension, which D1 ships with. */
      const { results } = await env.DB.prepare(
        `SELECT je.key AS model,
                COUNT(*) AS shifts,
                COUNT(DISTINCT s.player_id) AS players,
                AVG(json_extract(je.value,'$.gross') - json_extract(je.value,'$.cost')) AS avg_net,
                AVG(json_extract(je.value,'$.miles')) AS avg_miles,
                AVG(json_extract(je.value,'$.rides')) AS avg_rides,
                AVG(s.safety) AS avg_safety
           FROM stats s, json_each(s.models) je
          WHERE json_type(s.models) = 'object'
          GROUP BY je.key
          ORDER BY shifts DESC`
      ).all();
      const total = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM stats WHERE json_type(models) = 'object'`
      ).first();
      return json({ view, rows: results || [], totalShifts: (total && total.n) || 0 });
    }

    if (view === 'recent') {
      const { results } = await env.DB.prepare(
        `SELECT ts, player_id, name, city, day, shift_no, permit, net, cash, cars
           FROM stats
          ORDER BY ts DESC
          LIMIT 100`
      ).all();
      return json({ view, rows: results || [] });
    }

    return bad('unknown view');
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
  async fetch(request, env, ctx) {
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
        return await handleApi(request, env, url, ctx);
      } catch (err) {
        const msg = String((err && err.message) || err);
        // The overwhelmingly likely first-deploy failure: schema never applied.
        if (/no such table/i.test(msg)) {
          return bad('database tables are missing — run schema.sql against the ' +
            'D1 database, then reload', 503);
        }
        // The overwhelmingly likely SECOND-deploy failure: an additive column
        // (models, added after `stats` first shipped — see schema.sql's
        // migration note) never got backfilled onto an existing database.
        // Same spirit as the "no such table" case above: say the actual fix
        // instead of a bare 500.
        if (/no such column/i.test(msg)) {
          return bad('a database column is missing — re-run schema.sql (or the ' +
            'specific ALTER TABLE it documents) against the D1 database, then ' +
            'reload: ' + msg, 503);
        }
        console.error('api error', url.pathname, err && err.stack || err);
        return bad('server error', 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
