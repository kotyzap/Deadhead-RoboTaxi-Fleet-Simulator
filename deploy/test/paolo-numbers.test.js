/* Paolo's numbers come from the game, not from memory.
 *
 * WHAT THIS PROTECTS
 *
 * Beats 2 and 13 said "82 a day is the floor" — a bare numeral, no currency
 * mark, written into the prose. It was the Cab's fixed cost, and nothing
 * connected it to CATALOG, so it read as a typo and would have become a lie the
 * first time a trim was rebalanced. Beat 1 had the same fault and had ALREADY
 * become a lie: "Seven and a half thousand dollars" against a CFG.startCash of
 * 800, which is what the player saw in the topbar while reading it.
 *
 * Beat text is a const string, so live numbers are now tokens filled at show
 * time by rayFill(): {CASH} from S.cash, {FLOOR} from floorCost().
 *
 * The checks below deliberately assert *relationships* — token-free output,
 * agreement with CATALOG, agreement with S.cash — rather than the strings
 * themselves, so a balance change cannot fail them and a regression to a
 * hardcoded figure cannot pass them.
 *
 * Run: node test/paolo-numbers.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const GAME = path.join(__dirname, '..', '..', 'deadhead.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

function loadableScript(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '')
    .replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi, '');
}

(async () => {
  console.log("Paolo's numbers");

  const html = fs.readFileSync(GAME, 'utf8');
  const dom = new JSDOM(loadableScript(html), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {},
          removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      window.fetch = () => Promise.reject(new Error('offline in test'));
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const S = w.DH;
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes the fill',
    !!A && typeof A.rayFill === 'function' && typeof A.floorCost === 'function');
  if (!A) { process.exit(1) }

  // ---- floorCost(): cheapest in the catalogue, then what you actually hold --
  A.newFleet('austin');
  const cheapest = A.CATALOG.reduce((m, v) => Math.min(m, v.fixed), Infinity);
  check('with no car the floor is the cheapest fixed cost in the catalogue',
    A.floorCost() === cheapest, `got ${A.floorCost()}, cheapest ${cheapest}`);
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  A.acquire('cab', 'rent');
  const cab = A.catalog('cab');
  check('one car: the floor is that car\'s own fixed cost',
    A.floorCost() === cab.fixed);
  A.acquire('saloon', 'rent');
  check('two cars: the floor is the sum, so "it doesn\'t switch off with you" scales',
    A.floorCost() === cab.fixed + A.catalog('saloon').fixed);
  check('the floor EXCLUDES rent — both beats say "before rent, before finance"',
    A.floorCost() < S.cars.reduce((s, c) => s + A.fixedPerCar(c), 0));

  // ---- rayFill(): no token survives, and the values are live --------------
  A.newFleet('austin');
  const filled = A.rayFill('{CASH} · {FLOOR} · {NAME} · {FLOOR}');
  check('no token is left unfilled', !/\{[A-Z]+\}/.test(filled), filled);
  check('{CASH} is S.cash, not a remembered starting balance',
    filled.includes(A.money(S.cash)), filled);
  check('{FLOOR} is floorCost(), formatted as money',
    filled.includes(A.money(A.floorCost())), filled);
  check('{FLOOR} is filled EVERY time it appears, not just the first',
    filled.split(A.money(A.floorCost())).length === 3, filled);

  // ---- the beats themselves ----------------------------------------------
  const beat = (n) => A.RAY.filter((b) => b.n === n)[0].t;
  check('beat 2 carries a token, not a numeral', /\{FLOOR\}/.test(beat(2)));
  check('beat 13 carries a token too', /\{FLOOR\}/.test(beat(13)));
  check('beat 1 no longer states a starting balance in words',
    /\{CASH\}/.test(beat(1)) && !/thousand/i.test(beat(1)));
  check('no beat writes a bare "82" into the prose',
    !A.RAY.some((b) => /\b82\b/.test(b.t)));

  // Rendered for real: beat 2 fires in the garage, where the floor is the
  // catalogue's cheapest and the cash is whatever the player was handed.
  A.newFleet('austin');
  S.ray.skipped = false; S.ray.cur = null;
  A.rayShow(2);
  const shown = $('ray-text').textContent;
  check('beat 2 renders with a currency mark, not a naked number',
    // NOT /\b82 a day\b/ — \b matches between "$" and "8", so that would fail
    // on the correct output too. The bug being caught is a figure with no
    // currency mark in front of it.
    shown.includes(A.money(cheapest)) && !/(^|[^$\d])82 a day/.test(shown), shown);
  check('...and nothing token-shaped reaches the player',
    !/[{}]/.test(shown));
  A.rayShow(1);
  check('beat 1 greets the player with the cash they can see in the topbar',
    $('ray-text').textContent.includes(A.money(S.cash)));

  // ---- 0.49.2: the Messages/Comms history is a SEPARATE render path from
  // the live #ray card, and it was reading RAY[]'s raw .t straight off the
  // const — {NAME}/{CASH}/{FLOOR} and all, literally on screen once a beat
  // was dismissed into history (Pavel's screenshot, 2026-07-30). rayDismiss()
  // records the beat as seen, then render() rebuilds #msg-list from it.
  A.newFleet('austin');
  S.ray.skipped = false; S.ray.cur = null;
  A.rayShow(1);
  A.rayDismiss();
  A.render();
  const msgHtml = $('msg-list').innerHTML;
  check('the Messages history has no unfilled token once a beat is seen',
    !/\{[A-Z]+\}/.test(msgHtml), msgHtml);
  check('...and it shows the real cash/name, not the literal placeholders',
    msgHtml.includes(A.money(S.cash)), msgHtml);

  // ---- nextTask()'s 'car' advice had the same hardcoded figure ------------
  A.newFleet('austin');
  const t = A.nextTask();
  check('the "choose a vehicle" task quotes live cash',
    t.key === 'car' && t.why.includes(A.money(S.cash)) &&
    !/thousand/i.test(t.why), t.why);

  // ---- and no card note quotes a starting balance either -----------------
  check('no catalogue note states what the player has',
    !A.CATALOG.some((v) => /you have \$/i.test(v.note)),
    A.CATALOG.filter((v) => /you have \$/i.test(v.note)).map((v) => v.id).join());

  console.log(failures ? `\n${failures} failure(s)` : '\nall good');
  process.exit(failures ? 1 : 0);
})();
