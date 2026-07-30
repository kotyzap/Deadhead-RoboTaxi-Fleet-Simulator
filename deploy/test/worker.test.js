/* Worker HTTP-surface test harness — improvements.md P3-26.
 *
 * WHAT THIS PROTECTS
 *
 * Several security-relevant helpers in src/index.js had zero direct test
 * coverage before this file: isAdmin() (the brute-force throttle added in
 * P0-3), statThrottled()/bump() (the abuse ceilings added in P1-14), and
 * sanitizeModels()/sanitizeAchv() (the client-payload sanitizers backing
 * the leaderboard's per-model/achievement fields). slotAllowed() and the
 * Origin guard already have their own dedicated files (slot-allowed.test.js,
 * worker-edge-cases.test.js) and are deliberately not restated here.
 *
 * Extracted from src/index.js at run time (not hand-copied), same discipline
 * leaderboard.test.js/display-name.test.js already use, so this exercises
 * whatever is actually deployed rather than a stand-in that could drift.
 * isAdmin()'s own throttle runs against a real login_attempts table built
 * from schema.sql via node:sqlite, wrapped in a minimal async D1-shaped
 * facade (env.DB.prepare().bind().first()/.run()) — no network, no real
 * admin-config.js required or read: ADMIN_EMAIL/ADMIN_PASSWORD are supplied
 * by THIS file as fixture values, never the real (gitignored) secret.
 *
 * Run: node test/worker.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
const SCHEMA = path.join(__dirname, '..', 'schema.sql');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

const src = fs.readFileSync(SRC, 'utf8');

/* Extracts a named `function NAME(` or `const NAME = ` block by brace/paren
   balance, same low-tech-on-purpose approach the other extract-and-eval
   tests use — a real parser would hide exactly the kind of accidental
   truncation this is here to catch. */
function extractFn(name) {
  // `async function NAME(` must win over a bare `function NAME(` match, or
  // the extracted text starts AFTER "async " and drops it — every `await`
  // inside then throws "missing ) after argument list" at the top level of
  // the vm script, a confusing error for what is really a missing keyword.
  const asyncAt = src.indexOf('async function ' + name + '(');
  const at = asyncAt !== -1 ? asyncAt
    : src.search(new RegExp('(function ' + name + '\\(|const ' + name + '\\s*=)'));
  if (at === -1) throw new Error('could not find ' + name + ' in src/index.js');
  const braceAt = src.indexOf('{', at);
  const arrowSemiAt = src.indexOf(';', at);
  // Arrow/one-liner consts (e.g. `const clearFails = (a,b) => expr;`) end at
  // the first top-level semicolon rather than a brace.
  if (src.slice(at, braceAt === -1 ? arrowSemiAt : braceAt).includes('=>') &&
      (arrowSemiAt !== -1 && (braceAt === -1 || arrowSemiAt < braceAt))) {
    return src.slice(at, arrowSemiAt + 1);
  }
  let i = braceAt, depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(at, i + 1);
}

/* ---------------- part 1: statThrottled()/bump() — pure, no D1 needed --- */
{
  console.log('statThrottled() / bump() (improvements.md P1-14)');
  const pieces = ['const now = () => Date.now();'];
  // Pull every const this needs directly, by name, rather than guessing at
  // ordering/whitespace with one giant slice.
  for (const name of ['STAT_MAX_PER_WINDOW', 'STAT_WINDOW_MS', 'STAT_BUCKET_CAP',
                       'STAT_MAX_PER_IP_PER_WINDOW']) {
    const m = src.match(new RegExp('^const ' + name + '\\s*=\\s*([^;]+);', 'm'));
    if (!m) throw new Error('could not find const ' + name);
    pieces.push(`const ${name} = ${m[1]};`);
  }
  pieces.push('const statBuckets = new Map();');
  pieces.push('const statBucketsByIp = new Map();');
  pieces.push(extractFn('bump'));
  pieces.push(extractFn('statThrottled'));
  pieces.push('({ statThrottled, statBuckets, statBucketsByIp, STAT_MAX_PER_WINDOW, STAT_MAX_PER_IP_PER_WINDOW })');
  const { statThrottled, STAT_MAX_PER_WINDOW, STAT_MAX_PER_IP_PER_WINDOW } =
    vm.runInNewContext(pieces.join('\n'));

  for (let i = 0; i < STAT_MAX_PER_WINDOW; i++) statThrottled('p1', '1.2.3.4');
  check(`a (playerId, ip) pair is allowed up to STAT_MAX_PER_WINDOW (${STAT_MAX_PER_WINDOW}) hits`,
    statThrottled('p1', '1.2.3.4') === true,
    'the (STAT_MAX_PER_WINDOW+1)th call should be throttled');

  check('a DIFFERENT player from the SAME ip is not throttled by the first player\'s ceiling alone',
    (() => {
      // Drive the IP ceiling in isolation, on a player id nobody else used.
      let blocked = false;
      for (let i = 0; i < STAT_MAX_PER_IP_PER_WINDOW; i++) {
        blocked = statThrottled('fresh-player-' + i, '9.9.9.9');
      }
      return blocked === false; // the (cap)th call for a never-seen pair should still pass
    })());

  check('rotating playerId on the SAME ip still gets throttled by the per-IP ceiling',
    (() => {
      let hit = false;
      for (let i = 0; i < STAT_MAX_PER_IP_PER_WINDOW + 5; i++) {
        if (statThrottled('rotating-' + i, '5.5.5.5')) hit = true;
      }
      return hit === true;
    })(),
    'this is the exact P1-14 regression: a client rotating playerId must not bypass the IP bucket');
}

/* ---------------- part 2: sanitizeModels()/sanitizeAchv() --------------- */
{
  console.log('sanitizeModels() / sanitizeAchv() (client-payload sanitizers)');
  const modelIdsBlock = src.match(/const MODEL_IDS = \[([\s\S]*?)\];/);
  const achvIdsBlock = src.match(/const ACHV_IDS = \[([\s\S]*?)\];/);
  if (!modelIdsBlock) throw new Error('could not find MODEL_IDS');
  if (!achvIdsBlock) throw new Error('could not find ACHV_IDS');
  const pieces = [
    `const MODEL_IDS = [${modelIdsBlock[1]}];`,
    `const ACHV_IDS = [${achvIdsBlock[1]}];`,
    extractFn('clampNum'),
    extractFn('sanitizeModels'),
    extractFn('sanitizeAchv'),
    '({ sanitizeModels, sanitizeAchv, MODEL_IDS, ACHV_IDS })',
  ];
  const { sanitizeModels, sanitizeAchv, MODEL_IDS, ACHV_IDS } = vm.runInNewContext(pieces.join('\n'));
  const realModel = MODEL_IDS[0];

  check('a real model id survives, clamped', (() => {
    const out = JSON.parse(sanitizeModels({ [realModel]: { gross: 400, cost: 100, miles: 60, rides: 12 } }));
    return out[realModel] && out[realModel].gross === 400 && out[realModel].rides === 12;
  })());
  check('an unknown model id is dropped, not passed through',
    sanitizeModels({ 'totally-made-up-model': { gross: 1, cost: 0, miles: 1, rides: 1 } }) === null);
  check('a numeric field far outside range is clamped, not rejected wholesale', (() => {
    const out = JSON.parse(sanitizeModels({ [realModel]: { gross: 1e12, cost: -1e12, miles: -5, rides: -5 } }));
    return out[realModel].gross === 1e9 && out[realModel].cost === -1e9 &&
           out[realModel].miles === 0 && out[realModel].rides === 0;
  })());
  check('a non-object payload is rejected outright', sanitizeModels('not an object') === null);
  check('an array is rejected (Array.isArray guard)', sanitizeModels([]) === null);

  check('a real achievement id survives',
    JSON.parse(sanitizeAchv([ACHV_IDS[0]])).includes(ACHV_IDS[0]));
  check('an unknown achievement id is dropped',
    JSON.parse(sanitizeAchv([ACHV_IDS[0], 'not-a-real-achievement'])).length === 1);
  check('duplicates are deduped',
    JSON.parse(sanitizeAchv([ACHV_IDS[0], ACHV_IDS[0], ACHV_IDS[0]])).length === 1);
  check('a non-array is rejected', sanitizeAchv({ not: 'an array' }) === null);
  check('an empty (all-invalid) list yields null, not an empty-but-truthy string',
    sanitizeAchv(['nonsense-1', 'nonsense-2']) === null);
}

/* ---------------- part 3: isAdmin()'s brute-force throttle -------------- */
/* async, so wrapped in an IIFE — this file otherwise runs top-to-bottom
   synchronously, same as its sibling extract-and-eval tests. */
(async () => {
  console.log('isAdmin() brute-force throttle (improvements.md P0-3)');

  function makeD1(db) {
    return {
      DB: {
        prepare(sql) {
          const stmt = db.prepare(sql);
          let boundArgs = [];
          const handle = {
            bind(...args) { boundArgs = args; return handle; },
            first: async () => {
              const rows = stmt.all(...boundArgs);
              return rows.length ? rows[0] : null;
            },
            run: async () => { stmt.run(...boundArgs); return { success: true }; },
          };
          return handle;
        },
      },
    };
  }

  const pieces = [
    'const enc = new TextEncoder();',
    'const now = () => Date.now();',
    'const MAX_FAILS = ' + src.match(/const MAX_FAILS\s*=\s*(\d+);/)[1] + ';',
    'const FAIL_WINDOW_MS = ' + src.match(/const FAIL_WINDOW_MS\s*=\s*([^;]+);/)[1] + ';',
    // Fixture credentials — NEVER the real (gitignored) admin-config.js.
    "const ADMIN_EMAIL = 'fixture-admin@example.com';",
    "const ADMIN_PASSWORD = 'fixture-password-not-the-real-one-0000';",
    "const ADMIN_THROTTLE_KEY = '__admin__';",
    extractFn('timingSafeEqual'),
    extractFn('sha256raw'),
    extractFn('throttled'),
    extractFn('noteFail'),
    extractFn('clearFails'),
    extractFn('isAdmin'),
    '({ isAdmin, MAX_FAILS })',
  ];
  const { isAdmin, MAX_FAILS } = vm.runInNewContext(pieces.join('\n'), { TextEncoder, crypto });

  function fakeRequest(email, password) {
    const headers = new Map();
    if (email !== undefined) headers.set('x-admin-email', email);
    if (password !== undefined) headers.set('x-admin-password', password);
    return { headers: { get: (k) => (headers.has(k) ? headers.get(k) : null) } };
  }

  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  const env = makeD1(db);

  const correct = await isAdmin(
    fakeRequest('fixture-admin@example.com', 'fixture-password-not-the-real-one-0000'), env);
  check('the right email+password combination is accepted', correct === true);

  const missing = await isAdmin(fakeRequest(undefined, undefined), env);
  check('a request with neither header is rejected outright, no D1 hit needed',
    missing === false);

  let lastResult = true;
  for (let i = 0; i < MAX_FAILS; i++) {
    lastResult = await isAdmin(fakeRequest('fixture-admin@example.com', 'wrong-password'), env);
  }
  check(`${MAX_FAILS} wrong passwords in a row are all rejected (as themselves)`,
    lastResult === false);

  const stillWrongButRightCreds = await isAdmin(
    fakeRequest('fixture-admin@example.com', 'fixture-password-not-the-real-one-0000'), env);
  check('THE ACTUAL POINT: after MAX_FAILS failures, even the CORRECT password is throttled',
    stillWrongButRightCreds === false,
    'a brute-force guesser must be locked out regardless of whether their next guess is right');

  // A fresh sentinel (simulating the cooldown having elapsed) must accept again.
  db.exec(`DELETE FROM login_attempts`);
  const afterCooldown = await isAdmin(
    fakeRequest('fixture-admin@example.com', 'fixture-password-not-the-real-one-0000'), env);
  check('once the throttle record clears (cooldown), the correct password works again',
    afterCooldown === true);

  db.close();

  if (failures) {
    console.error(`\n${failures} worker check(s) failed.`);
    process.exit(1);
  }
  console.log('All worker checks passed.');
})();
