/* Worker edge-case guards — improvements.md P2-19 and P2-20.
 *
 * WHAT THIS PROTECTS
 *
 * Two small, easy-to-regress fixes in the fetch() entry point and the
 * byte-cap helper, neither exercised by any other test:
 *
 *   - byteLen() (P2-19): MAX_STAT_BYTES/MAX_SAVE_BYTES used to compare
 *     against `text.length` — UTF-16 code units, not bytes — so a payload
 *     heavy in multi-byte characters could reach several times the
 *     intended budget before being rejected.
 *   - the Origin check (P2-20): `new URL(origin)` used to run unguarded;
 *     an `Origin: null` header (a real value, not a fabrication — sent by
 *     sandboxed iframes, file:// pages, some redirects) made it throw
 *     uncaught, turning an ordinary edge-case request into a raw 500.
 *
 * Both are extracted from src/index.js and exercised directly, same
 * extract-and-eval pattern leaderboard.test.js uses for lbPlausible() —
 * this test breaks the moment either helper's actual behaviour regresses,
 * not just when a hand-copied stand-in would.
 *
 * Run: node test/worker-edge-cases.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'index.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('worker edge cases (improvements.md P2-19, P2-20)');

const src = fs.readFileSync(SRC, 'utf8');

/* ---- P2-19: byteLen() ---- */
{
  const m = src.match(/const enc = new TextEncoder\(\);[\s\S]*?const byteLen = \([^)]*\) => [^;]+;/);
  if (!m) throw new Error('could not find byteLen() in src/index.js');
  const byteLen = vm.runInNewContext(m[0] + '\nbyteLen', { TextEncoder });

  check('an ASCII string: byte length equals character length',
    byteLen('hello world') === 11);
  check('a multi-byte string: byte length EXCEEDS code-unit length',
    byteLen('日本語のテスト') > 'ご'.length, // sanity: multi-byte chars are >1 byte each
    'byteLen=' + byteLen('日本語のテスト') + ' length=' + '日本語のテスト'.length);
  // The actual regression this guards against: a UTF-16-length check would
  // have under-counted this by roughly half.
  const emoji = '🎮'.repeat(1000); // each is 2 UTF-16 code units, 4 UTF-8 bytes
  check('emoji-heavy payload: byte length is ~2x the UTF-16 code-unit length',
    byteLen(emoji) > emoji.length * 1.5,
    'byteLen=' + byteLen(emoji) + ' code units=' + emoji.length);
}

/* ---- P2-20: the Origin guard never throws, even on "null" ---- */
{
  const fnBody = src.match(
    /const origin = request\.headers\.get\('origin'\);\s*\n\s*if \(origin\) \{[\s\S]*?not allowed', 403\);\s*\n\s*\}\s*\n\s*\}/
  );
  if (!fnBody) throw new Error('could not find the Origin check block in src/index.js');
  // Wrap it as a callable function of (originHeader, hostStr) -> 'ok' | 'blocked'.
  const wrapped = `
    function checkOrigin(originHeader, hostStr) {
      const request = { headers: { get: () => originHeader } };
      const url = { host: hostStr };
      ${fnBody[0].replace(/return bad\([^)]*\);/, "return 'blocked';")}
      return 'ok';
    }
    checkOrigin;
  `;
  const checkOrigin = vm.runInNewContext(wrapped, { URL });

  check('same-origin request (matching host) passes', checkOrigin('https://game.deadhead.cc', 'game.deadhead.cc') === 'ok');
  check('cross-origin request (different host) is blocked', checkOrigin('https://evil.example', 'game.deadhead.cc') === 'blocked');
  check('no Origin header at all passes (not every request sends one)', checkOrigin(null, 'game.deadhead.cc') === 'ok');

  // THE actual regression: this used to throw a raw exception instead of
  // returning either value.
  let threw = false, result;
  try { result = checkOrigin('null', 'game.deadhead.cc') }
  catch (e) { threw = true }
  check('Origin: "null" does not throw', !threw, 'threw an uncaught exception instead of handling it');
  check('Origin: "null" is treated as cross-origin (blocked, not silently allowed)', result === 'blocked');
}

if (failures) {
  console.error(`\n${failures} worker-edge-case check(s) failed.`);
  process.exit(1);
}
console.log('All worker-edge-case checks passed.');
