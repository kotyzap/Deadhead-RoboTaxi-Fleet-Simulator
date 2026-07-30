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

/* Several shapes of write land here that are NOT one of the four player-
   visible slots above:
     - 'auto:<city>' — deadhead.html's physKey() rewrites the logical key
       'auto' to a per-city slot (see the comment above physKey() in
       deadhead.html) so Austin's autosave can't clobber Dallas's. This
       route's regex and this whitelist both predate that change, so every
       such write 404'd/400'd — the client fell back to a local-only save
       and logged "autosave failed" every cycle, silently.
     - 'progress' — progSave()'s record (city unlocks, achievements, Easter
       eggs). It was never added here either, so cloud accounts have never
       actually synced that record; it only ever lived in that browser's
       IndexedDB, which is why a found Easter egg or achievement can look
       like it "didn't take" after a reload on another device, or once
       local storage is cleared.
     - 'profile' — profileSave()'s record (deadhead.html, PROFILE.id/name).
     - 'history' — appendHistoryRow()'s shift-history log (deadhead.html,
       HISTORY).
   Both 'profile' and 'history' had the exact same bug as 'progress' above:
   never whitelisted, so every write from a signed-in player 400'd silently
   (the client swallows Store.put() rejections) and neither the player's
   display name nor their shift history has ever actually synced to the
   cloud — see improvements.md P0-1.
   None of the four are a player-chosen save slot, so they stay out of
   SLOTS (which /api/saves still enumerates verbatim for the Saves-modal
   UI) and are accepted here instead. */
function slotAllowed(slot) {
  if (SLOTS.includes(slot) || slot === 'progress' || slot === 'profile' || slot === 'history') return true;
  /* improvements.md P1-15: this used to accept ANY auto:[A-Za-z0-9_-]{1,16}
     — every distinct string a client sent under 'auto:' got its own row,
     each up to MAX_SAVE_BYTES (256 KB), with no cap on how many distinct
     slots one account could accumulate. A client is not required to send a
     real city id here (the server has no way to have verified that even if
     it wanted to, short of this exact whitelist), so nothing stopped an
     account from writing an unbounded number of 256 KB rows under made-up
     'auto:<anything>' keys. Whitelisting the real, finite city list closes
     it the same way MODEL_IDS/ACHV_IDS already whitelist client-supplied
     ids elsewhere in this file — bounds it at exactly CITY_IDS.length rows
     per account, no separate row-count query needed. */
  return slot.indexOf('auto:') === 0 && CITY_IDS.includes(slot.slice(5));
}

/* deadhead.html's CITIES ids, copied rather than shared — same copy-not-
   import trade as MODEL_IDS/ACHV_IDS below (this Worker has no import path
   back into the game engine). Used only to whitelist auto:<city> in
   slotAllowed() above. Keep in sync when a city ships; the cost of drift is
   that city's autosave 400ing until this list catches up, the same failure
   mode 'auto:<city>' itself had before physKey() was accounted for here at
   all — see the P0-1/P0-2 fixes earlier in this file's history. */
const CITY_IDS = ['austin', 'dallas', 'miami', 'tampa', 'orlando', 'sf'];

/* CATALOG ids from deadhead.html's CATALOG const, copied rather than shared
   — this Worker has no import path back into the game engine, and the list
   changes rarely enough that a copy is cheaper than building one. Used only
   to whitelist body.models on the way into `stats` (see /api/stat below);
   admin.html keeps its OWN copy (name/badge/photo) for rendering the Cars
   view, since that file never touches the server's module graph either. */
const MODEL_IDS = ['cab','saloon','cross','saloonlong','crosslong',
  'crosssix','saloonsport','crosssport','truck',
  /* Pre-0.42.0 ids. A client running a cached copy of the game, or replaying
     a save it has not yet migrated, still posts these — dropping them here
     would silently discard that player's per-model stats rather than fail
     loudly, which is the worst of both outcomes. Kept indefinitely; they cost
     nine strings. See MODEL_ALIAS in deadhead.html. */
  'cybercab','model3','modely','model3prem','modelyprem',
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
/* improvements.md P2-19: MAX_STAT_BYTES/MAX_SAVE_BYTES were both enforced
   with `text.length`, which is UTF-16 CODE UNITS, not bytes — every
   character outside the ASCII range (any non-English display name, city
   flavour text a save might round-trip, an emoji) costs 2-4 real bytes but
   counts as 1-2 code units, so a multi-byte-heavy payload could reach up to
   ~3-4x the intended budget before being rejected. enc.encode(str).length
   is the actual UTF-8 byte count these caps were always meant to measure. */
const byteLen = (str) => enc.encode(str).length;

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
/* improvements.md P2-18: the display name stored alongside (never instead
   of) username — see the column comment in schema.sql for why the two need
   to be different values at all. Deliberately NOT lowercased (unlike
   checkUsername) and NOT required to be unique: it is cosmetic, the same
   free-text PROFILE.name the player already sees in their own topbar, not
   a login credential. Returns null (not '') for anything invalid/blank so
   the caller can fall back to username cleanly with `||`. */
function checkDisplayName(v) {
  if (typeof v !== 'string') return null;
  const n = v.trim().slice(0, 40);
  if (!n) return null;
  if (/[\x00-\x1f]/.test(n)) return null;   // no control characters
  return n;
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
/* ---- edge geo (adminplan.md §3) ----
   The ONLY facts about a telemetry row that the client does not get to
   claim. Cloudflare attaches request.cf at the edge before this Worker is
   invoked, so these three cost no request, no latency and no D1 row — they
   ride along in an INSERT that was happening anyway.

   country falls back to the CF-IPCountry header, which is set even in some
   configurations where request.cf is absent; both are missing under
   `wrangler dev --local` and in tests, which is the null case the admin
   renders as "Unknown".

   'T1' is Cloudflare's code for a Tor exit node and 'XX' for "no country
   could be determined". Both are kept rather than nulled — "we know it was
   Tor" is information, and quietly folding it into Unknown would hide it.

   NO CITY, NO POSTCODE, NO LAT/LON, NO ASN, even though request.cf offers
   all four: player_id is a persistent per-browser uuid and a persistent id
   plus a city narrows to a household. See the geo block in schema.sql. */
function edgeGeo(request) {
  const cf = request.cf || {};
  return {
    country: clampStr(cf.country || request.headers.get('cf-ipcountry'), 8),
    region: clampStr(cf.region, 64),
    tz: clampStr(cf.timezone, 64),
  };
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
   miss is a junk row, not a broken query.

   IMPROVEMENTS.MD P1-14: keying SOLELY on `${playerId}|${ip}` was a real
   hole, not a theoretical one — playerId is a client-generated uuid the
   server never verifies, so a script that generates a fresh one per request
   starts a brand-new bucket every single time and never once hits
   STAT_MAX_PER_WINDOW. The combined key still exists (it is still the more
   precise bucket when the caller isn't doing that), but a SECOND bucket
   keyed on ip ALONE now backstops it, with a much higher ceiling — a real
   IP can legitimately host many distinct players (NAT, a campus network, a
   café), so this has to be loose enough not to punish that, while still
   being a real, finite ceiling a rotating-playerId script cannot escape. */
const statBuckets = new Map();     // `${playerId}|${ip}` -> { n, start }
const statBucketsByIp = new Map(); // `${ip}` -> { n, start }
const STAT_MAX_PER_IP_PER_WINDOW = 200; // ~6-7x a single real player's ceiling

function statThrottled(playerId, ip) {
  const nowMs = now();
  // Cheap unbounded-growth guard; see STAT_BUCKET_CAP.
  if (statBuckets.size > STAT_BUCKET_CAP) statBuckets.clear();
  if (statBucketsByIp.size > STAT_BUCKET_CAP) statBucketsByIp.clear();

  const ipHit = bump(statBucketsByIp, ip, STAT_MAX_PER_IP_PER_WINDOW, nowMs);
  const pairHit = bump(statBuckets, `${playerId}|${ip}`, STAT_MAX_PER_WINDOW, nowMs);
  return ipHit || pairHit;
}
/* Shared bump-or-reject helper for the two throttle maps above and
   registerBuckets below: true if this key is already at its ceiling for
   the current window, otherwise records the hit and returns false. Always
   uses STAT_WINDOW_MS (1 hour) as the window — one shared cadence for
   every in-memory/isolate-local throttle in this file, not a separate
   knob per endpoint that could quietly drift out of sync with the others. */
function bump(map, key, ceiling, nowMs) {
  const b = map.get(key);
  if (!b || nowMs - b.start > STAT_WINDOW_MS) {
    map.set(key, { n: 1, start: nowMs });
    return false;
  }
  if (b.n >= ceiling) return true;
  b.n++;
  return false;
}

/* improvements.md P1-14: /api/register's own throttle bucket — see the
   comment at its call site. A real player registers once; five in an hour
   from one connection is already generous. */
const registerBuckets = new Map(); // `${ip}` -> { n, start }
const REGISTER_MAX_PER_WINDOW = 5;

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
   probe cannot even confirm the endpoint exists (onboardingplan.md §4).

   THROTTLED NOW, LIKE EVERY OTHER LOGIN (improvements.md P0-3). This used
   to be the one auth path with no rate limit at all — /api/login throttles
   per-username via login_attempts, but isAdmin() ran the hash comparison on
   every single call with nothing above it, which made it an unlimited
   guessing oracle against a password whose only defence was its own length.
   There is exactly one admin identity, so it reuses the same
   throttled()/noteFail()/clearFails() helpers /api/login already uses
   against login_attempts, keyed on a fixed sentinel row rather than a
   per-user one — same discipline (8 fails / 15 min), same table, no new
   schema. A throttled attempt returns false here, which the caller turns
   into the same 404 a wrong password gets, so a prober still learns
   nothing beyond "this path 404s". */
const ADMIN_THROTTLE_KEY = '__admin__';
async function isAdmin(request, env) {
  const email = request.headers.get('x-admin-email');
  const password = request.headers.get('x-admin-password');
  if (!email || !password) return false;
  if (await throttled(env, ADMIN_THROTTLE_KEY)) return false;
  const [a1, a2, b1, b2] = await Promise.all([
    sha256raw(email.trim().toLowerCase()), sha256raw(ADMIN_EMAIL.trim().toLowerCase()),
    sha256raw(password), sha256raw(ADMIN_PASSWORD)
  ]);
  const ok = timingSafeEqual(a1, a2) && timingSafeEqual(b1, b2);
  if (ok) await clearFails(env, ADMIN_THROTTLE_KEY);
  else await noteFail(env, ADMIN_THROTTLE_KEY);
  return ok;
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

    /* improvements.md P2-18: u.username -> COALESCE(u.display_name,
       u.username). username is half the login credential; publishing it
       here handed a distributed guesser a verified list of real account
       names to try passwords against. display_name is a separate, cosmetic
       column (see schema.sql) that falls back to username only for a row
       from before this migration, or an account that never set one. The
       JSON key stays `username` below (the client just displays whatever
       string is in it — renaming the key would be churn with no benefit). */
    const { results } = await env.DB.prepare(
      `SELECT city, username, net, ts, rides, worked_h AS workedH FROM (
         SELECT s.city AS city, COALESCE(u.display_name, u.username) AS username, s.net AS net,
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
    /* improvements.md P1-14: this had NO throttle at all, on an endpoint
       that costs ~5 written rows per call (users + a session) and needs
       nothing but a made-up username/authKey pair to succeed repeatedly.
       IP-keyed, same in-memory/isolate-local trade-off statThrottled()
       already documents at length above (not global, resets on isolate
       recycle, real backstop is a Cloudflare Rate Limiting rule) — good
       enough for a stuck client or a single runaway script, which is the
       realistic threat against a free-plan Worker, not a distributed
       attacker with unlimited IPs. */
    if (bump(registerBuckets, clientIp(request), REGISTER_MAX_PER_WINDOW, now())) {
      return bad('too many accounts created from this connection — try again later', 429);
    }
    const body = await request.json().catch(() => null);
    if (!body) return bad('malformed request');
    const username = checkUsername(body.username);
    if (!username) return bad('enter a username');
    const keyErr = checkAuthKey(body.authKey);
    if (keyErr) return bad(keyErr);
    /* improvements.md P2-18: optional, and falls back to username itself
       when absent (an older cached client that doesn't send it yet, or a
       player who never set a display name) — this must never fail
       registration over a cosmetic field. */
    const displayName = checkDisplayName(body.displayName) || username;

    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
    if (exists) return bad('that username is already taken', 409);

    const id = newId();
    try {
      // country is stamped here and never touched again on later logins:
      // "where the account was opened" is the stable, more useful answer,
      // and re-writing it on every login would spend a write to make the
      // column noisier. Free — see edgeGeo().
      await env.DB.prepare(
        'INSERT INTO users (id, username, pw, created, last_seen, country, display_name) VALUES (?,?,?,?,?,?,?)'
      ).bind(id, username, await hashAuthKey(body.authKey), now(), now(),
             edgeGeo(request).country, displayName).run();
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
    const user = await env.DB.prepare('SELECT id, pw, last_seen FROM users WHERE username = ?').bind(username).first();

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
    /* improvements.md P1-14: this used to write last_seen on EVERY login,
       unconditionally — a returning player who signs in several times a
       day (a new tab, a phone and a laptop, a cleared cookie) spent a
       write each time for a column that only needs day-level resolution;
       nothing reads last_seen more precisely than that (see the days_active/
       retention queries in the admin dashboard below). Skipped once the
       existing value is already within the last 24h. */
    if (now() - (user.last_seen || 0) > 86400000) {
      await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now(), user.id).run();
    }
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
    if (byteLen(text) > MAX_STAT_BYTES) return bad('payload too large', 413);
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
    // The three columns on this row the payload does not get a vote on.
    const geo = edgeGeo(request);

    await env.DB.prepare(
      `INSERT INTO stats (
         player_id, user_id, name, created, ts,
         country, region, tz,
         city, day, shift_no, permit,
         worked_h, billed_h,
         gross, commission, cost, net,
         energy, dep, maint, ins, soft, fixed,
         miles, rides, cancels, safety,
         cash, cars, models, achv
       ) VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?, ?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?)`
    ).bind(
      playerId,
      sessionUser ? sessionUser.id : null,
      clampStr(body.name, 24),
      clampNum(body.created, 0, 4102444800000, null),   // 0 .. year 2100
      now(),
      geo.country, geo.region, geo.tz,
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
    if (!(await isAdmin(request, env))) return bad('no such endpoint', 404);

    const view = url.searchParams.get('view') || 'players';

    if (view === 'players') {
      /* THE NAME IS THE NEWEST ONE, NOT MAX(name).

         This was `MAX(name)` — the alphabetically last name a player has
         ever used — so anyone who renamed themselves showed up under
         whichever of their names happened to sort last, forever. Same
         question now applies to country: a player's CURRENT location, not
         their alphabetically-last one.

         The tempting fix is SQLite's bare-column rule (with exactly one
         min/max aggregate, bare columns come from the row that supplied it).
         It is NOT usable here: that guarantee holds only for a single
         min/max in the query, and this one has five. With more than one the
         row a bare column comes from is explicitly arbitrary — it would
         look right in testing and be quietly wrong later. So the newest row
         is selected properly, with ROW_NUMBER(), and joined on.

         days_active is the retention column that was missing: shifts alone
         cannot tell one long evening apart from a fortnight of play.

         LIMIT is 500 and `total` comes back alongside, so the page can say
         "showing 500 of 812" instead of silently omitting 312 people. */
      const [list, tot] = await env.DB.batch([
        env.DB.prepare(
          `SELECT g.player_id, g.created, g.first_seen, g.last_seen,
                  g.shifts, g.cities, g.days_active,
                  g.best_day, g.best_cash, g.best_cars,
                  n.name, n.country, n.region, n.tz
             FROM (
               SELECT player_id,
                      MAX(created) AS created,
                      MIN(ts) AS first_seen,
                      MAX(ts) AS last_seen,
                      COUNT(*) AS shifts,
                      COUNT(DISTINCT city) AS cities,
                      COUNT(DISTINCT date(ts/1000,'unixepoch')) AS days_active,
                      MAX(day) AS best_day,
                      MAX(cash) AS best_cash,
                      MAX(cars) AS best_cars
                 FROM stats
                GROUP BY player_id
             ) g
             JOIN (
               SELECT player_id, name, country, region, tz FROM (
                 SELECT player_id, name, country, region, tz,
                        ROW_NUMBER() OVER (PARTITION BY player_id
                                           ORDER BY ts DESC) AS rn
                   FROM stats
               ) WHERE rn = 1
             ) n ON n.player_id = g.player_id
            ORDER BY g.last_seen DESC
            LIMIT 500`
        ),
        env.DB.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM stats`),
      ]);
      return json({
        view,
        rows: list.results || [],
        total: (tot.results && tot.results[0] && tot.results[0].n) || 0,
        limit: 500,
      });
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
      /* ORDERED STAGES AND UNORDERED MILESTONES ARE NOW SEPARATE.
         They used to be one flat row of six equal cells, which reads as a
         sequence — but "turned a profit" and "ran 2+ cars" are not stages
         after "reached day 5", they are independent flags a player can trip
         at any point. Presenting them in funnel position implied a drop-off
         that was never being measured. The client renders `stages` as a
         funnel and `milestones` as a separate strip.

         day10/day20 and city2 are new: runs go far past day 5 now, and city
         unlock is the main Act 2 gate, so it belongs in the funnel that
         claims to describe progression. */
      const row = await env.DB.prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN shift_no >= 1 THEN player_id END) AS shift1,
           COUNT(DISTINCT CASE WHEN shift_no >= 2 THEN player_id END) AS shift2,
           COUNT(DISTINCT CASE WHEN shift_no >= 5 THEN player_id END) AS shift5,
           COUNT(DISTINCT CASE WHEN day >= 2 THEN player_id END) AS day2,
           COUNT(DISTINCT CASE WHEN day >= 5 THEN player_id END) AS day5,
           COUNT(DISTINCT CASE WHEN day >= 10 THEN player_id END) AS day10,
           COUNT(DISTINCT CASE WHEN day >= 20 THEN player_id END) AS day20,
           COUNT(DISTINCT CASE WHEN cars >= 2 THEN player_id END) AS fleet2,
           COUNT(DISTINCT CASE WHEN cars >= 5 THEN player_id END) AS fleet5,
           COUNT(DISTINCT CASE WHEN net > 0 THEN player_id END) AS profitable,
           COUNT(DISTINCT player_id) AS total
         FROM stats`
      ).first();
      /* Players who have filed a shift in two or more DIFFERENT cities —
         i.e. who got through a city unlock. Cannot be expressed as a CASE in
         the row above (it is a property of a player's whole history, not of
         any one row), so it is its own count over the per-player grouping. */
      const city2 = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT player_id FROM stats
            WHERE city IS NOT NULL AND city <> ''
            GROUP BY player_id
           HAVING COUNT(DISTINCT city) >= 2
         )`
      ).first();
      if (row) row.city2 = (city2 && city2.n) || 0;
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
      /* THE DENOMINATOR IS PLAYERS WHO REPORTED A LIST, NOT ALL PLAYERS.

         This was COUNT(DISTINCT player_id) over the whole table, which
         includes everyone whose rows predate the achievements release and so
         carry no `achv` column at all. Those players may well hold a dozen
         achievements each — we simply never asked — and dividing by them
         understated every single unlock rate on the page. The empty state
         already explained this carefully; the populated state divided by it
         anyway. Both denominators are returned now: `totalPlayers` is the
         honest one used for the rates, `allPlayers` is shown beside it so
         the size of the excluded group is visible rather than hidden. */
      const [rep, all] = await env.DB.batch([
        env.DB.prepare(
          `SELECT COUNT(DISTINCT player_id) AS n FROM stats
            WHERE achv IS NOT NULL AND json_valid(achv)
              AND json_type(achv) = 'array'`
        ),
        env.DB.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM stats`),
      ]);
      const one = (r) => (r.results && r.results[0] && r.results[0].n) || 0;
      return json({
        view,
        rows: results || [],
        totalPlayers: one(rep),
        allPlayers: one(all),
      });
    }

    if (view === 'economics') {
      /* Median, not mean — a handful of bankruptcy rows or a whale run
         would otherwise swing an average past what a typical shift looks
         like. Standard SQLite median trick: rank each row within its
         (city, shift_no) group and average the one or two middle ranks. */
      /* MEDIAN ALONE COULD NOT DO THE JOB THIS SECTION EXISTS FOR.
         "The mistuning detector" has to distinguish a city where every
         player nets about the same wrong number from one where the spread is
         enormous and the median is an accident — those want opposite fixes.
         So p25 and p75 come back too, from the same single ranked pass:
         rank each row within its (city, shift_no) group once, then pick the
         middle one or two ranks for the median and the quarter/three-quarter
         ranks for the fences.

         `shift_no` is also bucketed now. It used to be raw, so a player on
         shift 61 added a row of its own to a table that then grew without
         bound; anything past 10 is now rolled into one bucket, which is also
         where the sample sizes stop meaning much. The client dims low-n rows
         rather than hiding them — a median over n=1 is still a fact, just
         not one to tune against. */
      const { results } = await env.DB.prepare(
        `SELECT city, bucket AS shift_no, COUNT(*) AS n,
                AVG(CASE WHEN rn IN ((cnt+1)/2, (cnt+2)/2) THEN net END) AS median_net,
                MIN(CASE WHEN rn >= (cnt+3)/4 THEN net END) AS p25,
                MIN(CASE WHEN rn >= (cnt*3+3)/4 THEN net END) AS p75,
                MIN(net) AS min_net, MAX(net) AS max_net
           FROM (
             SELECT city, net,
                    MIN(shift_no, 11) AS bucket,
                    ROW_NUMBER() OVER (PARTITION BY city, MIN(shift_no, 11)
                                       ORDER BY net) AS rn,
                    COUNT(*) OVER (PARTITION BY city, MIN(shift_no, 11)) AS cnt
               FROM stats
              WHERE shift_no IS NOT NULL
           )
          GROUP BY city, bucket
          ORDER BY city, bucket`
      ).all();
      /* bucket 11 means "shift 11 or later" — the client labels it "11+".
         Sent as a flag rather than left for the page to infer from a magic
         number. */
      return json({ view, rows: results || [], lateBucket: 11 });
    }

    if (view === 'cars') {
      /* `models` is a per-model breakdown, { modelId: {gross,cost,miles,rides}, ... }
         — one shift row can still name several models (a mixed fleet), so
         json_each() explodes it into one (row, model) pair per model
         present, same as before. What changed (Pavel's fix for identical
         numbers across models sharing a fleet): each model's own gross/cost/
         miles/rides now come from json_extract() on ITS OWN entry, not from
         the whole-shift stats.* columns — a Cab and a Saloon in the
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
      /* gross/rides/miles/worked_h added: net alone cannot tell a busy shift
         from a lucky one, which is the first thing you want to know when a
         row looks odd. country comes along for free now that it is stored. */
      const [list, tot] = await env.DB.batch([
        env.DB.prepare(
          `SELECT ts, player_id, name, country, region, city, day, shift_no,
                  permit, worked_h, gross, net, cash, cars, rides, miles, safety
             FROM stats
            ORDER BY ts DESC
            LIMIT 200`
        ),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM stats`),
      ]);
      return json({
        view,
        rows: list.results || [],
        total: (tot.results && tot.results[0] && tot.results[0].n) || 0,
        limit: 200,
      });
    }

    /* --- geography: the country view (adminplan.md §3) ---
       Counts NULL country as 'Unknown' rather than dropping it: every row
       written before geo shipped has one, and those are real players whose
       omission would understate every total on the page. */
    if (view === 'geo') {
      const { results } = await env.DB.prepare(
        `SELECT COALESCE(NULLIF(country,''),'??') AS country,
                COUNT(DISTINCT player_id) AS players,
                COUNT(*) AS shifts,
                COUNT(DISTINCT region) AS regions,
                AVG(net) AS avg_net,
                MAX(day) AS best_day,
                MAX(ts) AS last_seen
           FROM stats
          GROUP BY 1
          ORDER BY players DESC, shifts DESC`
      ).all();
      /* Region breakdown, capped — on a US-heavy audience this is the state
         list, which is the genuinely interesting cut for a game set in six
         American cities. */
      const { results: regions } = await env.DB.prepare(
        `SELECT COALESCE(NULLIF(country,''),'??') AS country,
                COALESCE(NULLIF(region,''),'—') AS region,
                COUNT(DISTINCT player_id) AS players,
                COUNT(*) AS shifts
           FROM stats
          GROUP BY 1,2
          ORDER BY players DESC, shifts DESC
          LIMIT 100`
      ).all();
      return json({ view, rows: results || [], regions: regions || [] });
    }

    /* ---------------- the dashboard ----------------
       The landing view: ten TOP 5 cards over four summary subsections
       (adminplan.md §5).

       ONE ROUND TRIP. Every block below is a GROUP BY scan of `stats`, and
       fourteen sequential `await`s would be fourteen round trips to D1 for a
       page that could have made one. env.DB.batch() sends them together.

       WHY THE READ COST IS FINE, given how carefully this file counts
       writes: D1's free plan allows 5,000,000 ROWS READ per day against
       100,000 rows written. Reads are the cheap side of that ledger by a
       factor of fifty, and this page is opened by one person. It is the same
       reasoning schema.sql uses to justify letting the `recent` view scan
       rather than paying for an index — and, importantly, this adds no
       writes at all.

       It also does not threaten the Workers 10 ms CPU limit (the limit that
       forced PBKDF2 into the browser — see the top of this file): D1 query
       time is I/O wait, not CPU. */
    if (view === 'dashboard') {
      const TOP = 5;
      const q = [
        // --- 0: top countries by distinct players
        env.DB.prepare(
          `SELECT COALESCE(NULLIF(country,''),'??') AS k,
                  COUNT(DISTINCT player_id) AS v
             FROM stats GROUP BY 1 ORDER BY v DESC, k LIMIT ${TOP}`),
        // --- 1: top in-game cities by shifts filed
        env.DB.prepare(
          `SELECT city AS k, COUNT(*) AS v, COUNT(DISTINCT player_id) AS v2
             FROM stats WHERE city IS NOT NULL AND city <> ''
            GROUP BY 1 ORDER BY v DESC LIMIT ${TOP}`),
        // --- 2: top car models by shifts run.
        // json_type(models)='object' skips the legacy array shape, same
        // filter the Cars view uses — see its comment.
        env.DB.prepare(
          `SELECT je.key AS k, COUNT(*) AS v, COUNT(DISTINCT s.player_id) AS v2
             FROM stats s, json_each(s.models) je
            WHERE json_type(s.models) = 'object'
            GROUP BY 1 ORDER BY v DESC LIMIT ${TOP}`),
        // --- 3: RAREST achievements that at least one player holds.
        // Deliberately not the zero rows: "in the game, nobody has it" is a
        // catalogue fact the Achievements view already reports properly by
        // walking the catalogue, and it cannot be seen from this query at
        // all (json_each only knows ids somebody has). What this card
        // answers is the different question of which EARNED achievement is
        // hardest.
        env.DB.prepare(
          `SELECT je.value AS k, COUNT(DISTINCT s.player_id) AS v
             FROM stats s, json_each(s.achv) je
            WHERE s.achv IS NOT NULL AND json_valid(s.achv)
              AND json_type(s.achv) = 'array'
            GROUP BY 1 ORDER BY v ASC, k LIMIT ${TOP}`),
        /* --- 4,5,6: the three per-player cards.
           THE BARE `name` IS DELIBERATE AND IS SAFE HERE.
           SQLite guarantees that when a grouped query contains EXACTLY ONE
           min()/max() aggregate, every bare column in the result comes from
           the row that supplied that extreme. Each of these three has
           exactly one — so `name` is the name from the newest row (4), from
           the row where they hit their best balance (5), and from their
           deepest day (6). All three are the name you would want beside that
           number.
           This is the same rule the `players` view could NOT use, because it
           has five min/max aggregates and the guarantee only holds for one;
           see the long comment there. Never add a second min/max to these
           without switching them to the ROW_NUMBER() join. */
        // --- 4: most active players by shifts filed
        env.DB.prepare(
          `SELECT player_id AS id, name AS k, COUNT(*) AS v, MAX(ts) AS t
             FROM stats GROUP BY player_id ORDER BY v DESC LIMIT ${TOP}`),
        // --- 5: best cash
        env.DB.prepare(
          `SELECT player_id AS id, name AS k, MAX(cash) AS v
             FROM stats GROUP BY player_id ORDER BY v DESC LIMIT ${TOP}`),
        // --- 6: longest runs by day reached
        env.DB.prepare(
          `SELECT player_id AS id, name AS k, MAX(day) AS v
             FROM stats GROUP BY player_id ORDER BY v DESC LIMIT ${TOP}`),
        // --- 7: busiest calendar days (SERVER time — see schema.sql)
        env.DB.prepare(
          `SELECT date(ts/1000,'unixepoch') AS k, COUNT(*) AS v,
                  COUNT(DISTINCT player_id) AS v2
             FROM stats GROUP BY 1 ORDER BY v DESC LIMIT ${TOP}`),
        // --- 8: newest players, by their first ever shift. One min/max, so
        // `name` is the name on that first row — the name they arrived with.
        env.DB.prepare(
          `SELECT player_id AS id, name AS k, MIN(ts) AS v,
                  COUNT(*) AS v2
             FROM stats GROUP BY player_id ORDER BY v DESC LIMIT ${TOP}`),
        // --- 9: DROP-OFF — the shift number a player was last seen on.
        // Read this one carefully and note the caveat the client prints: it
        // conflates "quit here" with "still playing, just hasn't come back
        // yet today", and it always will. It is a shape, not a verdict.
        env.DB.prepare(
          `SELECT last_shift AS k, COUNT(*) AS v FROM (
             SELECT player_id, MAX(shift_no) AS last_shift
               FROM stats WHERE shift_no IS NOT NULL GROUP BY player_id
           ) GROUP BY 1 ORDER BY v DESC LIMIT ${TOP}`),
        // --- 10: right now
        env.DB.prepare(
          `SELECT
             COUNT(*) AS shifts_all,
             COUNT(DISTINCT player_id) AS players_all,
             MAX(ts) AS newest,
             MIN(ts) AS oldest,
             SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS shifts_24h,
             COUNT(DISTINCT CASE WHEN ts >= ? THEN player_id END) AS players_24h,
             SUM(CASE WHEN ts >= ? THEN 1 ELSE 0 END) AS shifts_7d,
             COUNT(DISTINCT CASE WHEN ts >= ? THEN player_id END) AS players_7d
           FROM stats`
        ).bind(now() - 864e5, now() - 864e5, now() - 6048e5, now() - 6048e5),
        // --- 11: HEALTH. The section that tells you a migration did not
        // run: a legacy-shape or all-NULL column shows up as a count here
        // instead of as a mysteriously empty panel somewhere else.
        env.DB.prepare(
          `SELECT
             COUNT(*) AS rows_all,
             SUM(CASE WHEN models IS NULL THEN 1 ELSE 0 END) AS no_models,
             SUM(CASE WHEN models IS NOT NULL
                       AND json_valid(models)
                       AND json_type(models) <> 'object' THEN 1 ELSE 0 END) AS legacy_models,
             SUM(CASE WHEN achv IS NULL THEN 1 ELSE 0 END) AS no_achv,
             SUM(CASE WHEN country IS NULL OR country = '' THEN 1 ELSE 0 END) AS no_country,
             SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS anon
           FROM stats`),
        // --- 12: the funnel, compact — same numbers as the funnel view so
        // the two can never disagree.
        env.DB.prepare(
          `SELECT
             COUNT(DISTINCT player_id) AS total,
             COUNT(DISTINCT CASE WHEN shift_no >= 2 THEN player_id END) AS shift2,
             COUNT(DISTINCT CASE WHEN day >= 2 THEN player_id END) AS day2,
             COUNT(DISTINCT CASE WHEN day >= 5 THEN player_id END) AS day5,
             COUNT(DISTINCT CASE WHEN day >= 10 THEN player_id END) AS day10,
             COUNT(DISTINCT CASE WHEN net > 0 THEN player_id END) AS profitable,
             COUNT(DISTINCT CASE WHEN cars >= 2 THEN player_id END) AS fleet2
           FROM stats`),
        // --- 13: registered accounts by country (users, not stats — a
        // different population: an account is opened once, a shift is filed
        // many times).
        env.DB.prepare(
          `SELECT COALESCE(NULLIF(country,''),'??') AS k, COUNT(*) AS v
             FROM users GROUP BY 1 ORDER BY v DESC, k LIMIT ${TOP}`),
      ];

      const res = await env.DB.batch(q);
      const rows = (i) => (res[i] && res[i].results) || [];
      const one = (i) => rows(i)[0] || {};

      return json({
        view,
        tops: {
          countries: rows(0),
          gameCities: rows(1),
          cars: rows(2),
          rarestAchv: rows(3),
          activePlayers: rows(4),
          bestCash: rows(5),
          longestRuns: rows(6),
          busiestDays: rows(7),
          newestPlayers: rows(8),
          dropoff: rows(9),
          accountCountries: rows(13),
        },
        pulse: one(10),
        health: one(11),
        funnel: one(12),
        serverTime: now(),
      });
    }

    return bad('unknown view');
  }

  /* everything past here needs a session */
  const user = await currentUser(request, env);
  if (!user) return bad('not signed in', 401);

  /* --- list slots (metadata only, so the UI stays cheap) ---
     FOLD auto:<city> INTO 'auto' (improvements.md P0-2, part 2). deadhead.html's
     physKey() rewrites every autosave write to 'auto:<city>' (see the long
     comment above physKey()), so a signed-in player never actually has a row
     under the bare 'auto' slot — this endpoint returned out.auto = null
     forever, and the Saves modal (renderSaves() reads exactly `all.auto`,
     nothing else) showed an empty autosave row for every signed-in player
     even though real autosave data existed under 'auto:austin' etc.
     Mirrors LocalStore.list() client-side, which does the same fold for the
     CURRENT city's key — this can't key off "current city" (this endpoint
     has no idea what city the caller is even looking at), so it takes the
     most recently written auto:<city> row instead, which is the one the
     Saves modal actually wants to show. */
  if (p === '/api/saves' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT slot, version, ts, day, cash, cars, clock FROM saves WHERE user_id = ?'
    ).bind(user.id).all();
    const out = {};
    for (const s of SLOTS) out[s] = null;
    let newestAuto = null;
    for (const r of results || []) {
      const meta = { v: r.version, ts: r.ts, meta: { day: r.day, cash: r.cash, cars: r.cars, clock: r.clock } };
      if (r.slot === 'auto') {
        out.auto = meta;
      } else if (r.slot.indexOf('auto:') === 0) {
        if (!newestAuto || r.ts > newestAuto.ts) newestAuto = meta;
      } else if (SLOTS.includes(r.slot)) {
        out[r.slot] = meta;
      }
    }
    if (!out.auto && newestAuto) out.auto = newestAuto;
    return json(out);
  }

  /* --- one slot: read / write / delete ---
     Colon is in the charset so 'auto:<city>' matches at all; slotAllowed()
     is the actual whitelist (see its comment above). */
  const m = p.match(/^\/api\/save\/([A-Za-z0-9_:-]{1,24})$/);
  if (m) {
    const slot = m[1];
    if (!slotAllowed(slot)) return bad('unknown slot');

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
      if (byteLen(text) > MAX_SAVE_BYTES) return bad('save too large', 413);
      let save;
      try { save = JSON.parse(text) } catch { return bad('save is not valid JSON') }
      /* progSave()/profileSave()/appendHistoryRow()'s records have no `.s` —
         none of them is a gameplay snapshot (progress is {unlocked, results,
         eggs, achv, ...}, profile is {id, name, created}, history is
         {rows}), and none has ever been shaped like one. Requiring `.s` for
         every slot is what made every write to these three 400 as "not a
         Deadhead save" — see improvements.md P0-1 for 'profile'/'history',
         which had the exact bug 'progress' was already carved out for. */
      if (!save || typeof save !== 'object' || typeof save.v !== 'number' ||
          (slot !== 'progress' && slot !== 'profile' && slot !== 'history' && !save.s)) {
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
      //
      // improvements.md P2-20: `new URL(origin)` used to run un-guarded.
      // An `Origin: null` header — a real header value browsers send from
      // a sandboxed iframe, a file:// page, or certain redirect chains, not
      // a hostile fabrication — makes `origin` the literal string "null",
      // which is not a parseable URL: `new URL('null')` throws, uncaught,
      // all the way out of this handler and into a bare 500 with no `bad()`
      // JSON body, for a request that was never actually malicious. An
      // unparseable Origin is treated the same as a cross-origin one (403,
      // the same response a real cross-origin request already gets) —
      // strictly safer than letting it through, and no worse for a
      // same-origin browser request, which never sends a header shaped
      // like this in the first place.
      const origin = request.headers.get('origin');
      if (origin) {
        let originHost;
        try { originHost = new URL(origin).host } catch { originHost = null }
        if (originHost !== url.host) {
          return bad('cross-origin requests are not allowed', 403);
        }
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
