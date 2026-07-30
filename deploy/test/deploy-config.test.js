/* wrangler.jsonc guard.
 *
 * WHY THIS EXISTS
 *
 * On 2026-07-30 Pavel could not sign in to the admin. It was not the password.
 * wrangler.jsonc had been overwritten with a stripped version that dropped
 * `"main": "src/index.js"` — and a Workers config with `assets` but no `main`
 * is a STATIC-ASSETS-ONLY deployment. src/index.js is never bundled and never
 * runs, so every /api/* request falls through to the asset handler and 404s.
 *
 * That failure is close to invisible, which is what makes it worth a test:
 *
 *   - the game still loads and still plays (local browser saves, by design)
 *   - admin.html still loads and still renders its gate
 *   - the only symptom is that every API call 404s, which the admin gate
 *     reported as "wrong email/password, or the endpoint is not deployed" —
 *     i.e. it pointed at the password, the one thing that was fine
 *   - cloud saves, the leaderboard and ALL telemetry are dead too, silently
 *
 * The same edit also removed the D1 binding (so `env.DB` would be undefined
 * even with `main` restored) and renamed the Worker, which on workers.dev
 * changes the hostname — a deploy would have quietly created a second site
 * instead of updating the live one.
 *
 * So: every binding the Worker actually uses must be declared, and the entry
 * point must exist. `npm run predeploy` runs this, so a config like that
 * cannot reach `wrangler deploy`.
 *
 * Run: node test/deploy-config.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');

const DEPLOY = path.join(__dirname, '..');
const CONFIG = path.join(DEPLOY, 'wrangler.jsonc');
const WORKER = path.join(DEPLOY, 'src', 'index.js');

let fails = 0;
function ok(cond, label, detail) {
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (!cond && detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}
function eq(actual, expected, label) {
  const good = actual === expected;
  ok(good, label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('\nwrangler.jsonc');

ok(fs.existsSync(CONFIG), 'wrangler.jsonc exists');
const raw = fs.readFileSync(CONFIG, 'utf8');

/* JSONC: line comments are legal and this file uses them heavily (they carry
   the reason the D1 id is not a secret, among other things). Strip only
   whole-line comments — enough for this file, and it will not eat a `//`
   inside a string such as a URL. */
let cfg = null;
try {
  cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
} catch (err) {
  ok(false, 'wrangler.jsonc parses as JSONC', err.message);
}
if (!cfg) { console.error('\ncannot continue without a parseable config'); process.exit(1) }

/* ---- THE ENTRY POINT. This is the one that broke. ---- */
ok(typeof cfg.main === 'string' && cfg.main.length > 0,
  'a "main" entry point is declared',
  'without it, `assets` alone makes this a static-only deploy and NOTHING in ' +
  'src/index.js ever runs — every /api/* request 404s while the site still looks fine');
if (cfg.main) {
  ok(fs.existsSync(path.join(DEPLOY, cfg.main)), `"main" (${cfg.main}) exists on disk`);
  eq(path.resolve(DEPLOY, cfg.main), WORKER, '"main" points at src/index.js');
}

/* ---- EVERY BINDING THE WORKER USES MUST BE DECLARED ----
   The generalisable version of the bug: read the bindings out of the Worker
   source rather than listing them here, so a new binding added to the code
   fails this test until it is added to the config. */
const worker = fs.readFileSync(WORKER, 'utf8');
const used = [...new Set([...worker.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]))].sort();
ok(used.length > 0, `found ${used.length} env bindings used by the Worker: ${used.join(', ')}`);

const declared = new Set();
if (cfg.assets && cfg.assets.binding) declared.add(cfg.assets.binding);
for (const d of cfg.d1_databases || []) if (d.binding) declared.add(d.binding);
for (const k of Object.keys(cfg.vars || {})) declared.add(k);
for (const b of cfg.kv_namespaces || []) if (b.binding) declared.add(b.binding);
for (const b of cfg.r2_buckets || []) if (b.binding) declared.add(b.binding);
for (const b of cfg.queues && cfg.queues.producers || []) if (b.binding) declared.add(b.binding);

const missing = used.filter((b) => !declared.has(b));
eq(missing.join(','), '',
  `every binding the Worker uses is declared (declared: ${[...declared].sort().join(', ') || 'none'})`);

/* ---- the two specific bindings, named, because the messages matter ---- */
ok(declared.has('DB'), 'the D1 binding is called DB',
  'src/index.js reads env.DB; without it the API answers 503 "accounts are not configured"');
const d1 = (cfg.d1_databases || [])[0];
ok(!!d1, 'a d1_databases entry exists');
if (d1) {
  eq(d1.database_name, 'deadhead-db', 'the D1 database is deadhead-db');
  ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d1.database_id || ''),
    'database_id is a real uuid, not a placeholder',
    'wrangler validates bindings before publishing and fails with error 10021');
}
ok(declared.has('ASSETS'), 'the assets binding is called ASSETS',
  'src/index.js ends with env.ASSETS.fetch(request) — the static-file fallthrough');

/* ---- assets routing ---- */
ok(cfg.assets && typeof cfg.assets.directory === 'string', 'an assets directory is declared');
if (cfg.assets && cfg.assets.directory) {
  ok(fs.existsSync(path.join(DEPLOY, cfg.assets.directory)),
    `the assets directory (${cfg.assets.directory}) exists`);
  ok(fs.existsSync(path.join(DEPLOY, cfg.assets.directory, 'index.html')),
    'the assets directory contains index.html (the game)');
  ok(fs.existsSync(path.join(DEPLOY, cfg.assets.directory, 'admin.html')),
    'the assets directory contains admin.html');
}
/* Explicit, not incidental: assets win over the Worker by default when a path
   matches a file, and "/api/*" matching nothing today is luck, not policy. */
const first = (cfg.assets && cfg.assets.run_worker_first) || [];
ok(Array.isArray(first) && first.some((r) => /^\/api\/?\*?$/.test(r) || r === '/api/*'),
  'run_worker_first routes /api/* to the Worker before the asset handler',
  'got: ' + JSON.stringify(first));

/* ---- the name is the hostname ----
   On workers.dev the deployment is <name>.<account>.workers.dev, so renaming
   this does not rename a site — it deploys a SECOND one and leaves the live
   host serving whatever was there before. The live admin is
   game.deadhead.workers.dev, so `game` is load-bearing. If you ever rename
   deliberately, change it here too and expect a new URL. */
eq(cfg.name, 'game', 'the Worker is still called "game" (= game.<account>.workers.dev)');

ok(typeof cfg.compatibility_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cfg.compatibility_date),
  `a compatibility_date is set (${cfg.compatibility_date})`);

console.log('');
if (fails) {
  console.error(fails + ' deploy-config check(s) FAILED');
  console.error('A config that fails these still SERVES THE SITE — it just turns off');
  console.error('the whole API. Fix it before deploying.');
  process.exit(1);
}
console.log('All deploy-config checks passed.');
