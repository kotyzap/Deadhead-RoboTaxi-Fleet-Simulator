/* In-car Decline button test.
 *
 * WHAT THIS PROTECTS
 *
 * The console's primary action used to be Accept-only: the sole way to refuse
 * a ride was the small per-row Decline in the Offers panel, which is not where
 * a player looking at the in-car display is looking. #cta-dec puts the refusal
 * next to the acceptance.
 *
 * Three things about it are easy to break and invisible when broken:
 *
 *   1. IT MUST TARGET THE SAME OFFER THE CTA NAMES. Both sort by offerNet()
 *      and take [0]. If one of the two sorts ever drifts — a different
 *      comparator, raw fare instead of net of commission — the pair silently
 *      stops being one decision about one ride, and you decline something
 *      other than what the button says.
 *
 *   2. IT MUST GO THROUGH declineOffer(), NOT SPLICE S.offers ITSELF.
 *      declineOffer() is where the acceptance-rate accounting lives and where
 *      Paolo's first-decline beat fires (rayFirstDecline). A hand-rolled
 *      filter here would refuse the ride without any of the consequences,
 *      which is a free "make this offer go away" button.
 *      Distinguished from an accept by platform.accepted NOT moving.
 *
 *   3. THE MARGIN MUST LIVE ON .t-cta-row, NOT .t-cta. Accept and Decline are
 *      now siblings in a flex row. While .t-cta kept its own margin:10px the
 *      two controls each inset themselves and the pair sat unevenly inside the
 *      card — and the five responsive tiers each re-set that margin, so the
 *      bug reappeared per breakpoint. The CSS check below fails if any
 *      `.t-cta{...}` rule reintroduces a non-zero margin.
 *
 * Run: node test/decline-cta.test.js  (or: npm test)
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

const src = fs.readFileSync(GAME, 'utf8');

(async () => {
  console.log('in-car Decline button');

  // ---- CSS: the row owns the margin ---------------------------------------
  check('.t-cta-row exists as the flex row holding both controls',
    /\.t-cta-row\{[^}]*display:flex/.test(src));

  const ctaRules = src.match(/\.t-cta\{[^}]*\}/g) || [];
  check('at least one .t-cta rule was found to inspect', ctaRules.length > 0);
  const badMargin = ctaRules.filter((r) => /margin:(?!0[};])/.test(r));
  check('no .t-cta rule sets a non-zero margin — the row owns it now',
    badMargin.length === 0, badMargin.join(' | '));

  /* --cta-h is the single height authority, read on both axes by .t-dec.
     The first version squared the button with `aspect-ratio:1` and let
     align-items:stretch supply the height. That is circular — the ratio wants
     the cross size, the line's cross size wants the tallest item — so the
     browser sized the width from the available space and squared THAT,
     rendering a ~310px button beside a 52px one. Assert the fix in both
     directions: .t-dec reads the variable, and no tier sets .t-cta's height
     behind the variable's back. */
  check('.t-dec takes BOTH axes from --cta-h, not aspect-ratio',
    /\.t-dec\{[^}]*width:var\(--cta-h\)[^}]*height:var\(--cta-h\)/.test(src) &&
      !/\.t-dec\{[^}]*aspect-ratio/.test(src));
  check('.t-cta\'s height comes from --cta-h too',
    /\.t-cta\{[^}]*height:var\(--cta-h\)/.test(src));
  const rawHeights = ctaRules.filter((r) => /height:(?!var\(--cta-h\))/.test(r));
  check('no .t-cta rule sets a raw height — the tiers move --cta-h instead',
    rawHeights.length === 0, rawHeights.join(' | '));
  const tiers = (src.match(/\.t-cta-row\{[^}]*--cta-h:/g) || []).length;
  check('--cta-h is declared once as the base plus one per resizing tier (5)',
    tiers === 5, `found ${tiers}`);
  check('.t-dec has a disabled state that drops the red',
    /\.t-dec:disabled\{/.test(src));

  const dom = new JSDOM(loadableScript(src), {
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

  check('DH_ACT1 exposes what this test needs',
    !!A && typeof A.declineOffer === 'function' && typeof A.acceptOffer === 'function' &&
      typeof A.offerNet === 'function' && typeof A.render === 'function');
  if (!A) { process.exit(1) }

  // ---- markup -------------------------------------------------------------
  const dec = $('cta-dec');
  const cta = $('cta');
  check('#cta-dec exists', !!dec);
  if (!dec) { process.exit(1) }
  check('#cta-dec is a real <button>', dec.tagName === 'BUTTON');
  check('#cta-dec is a sibling of #cta, not nested inside it',
    dec.parentElement === cta.parentElement && !cta.contains(dec));
  check('the shared parent is .t-cta-row',
    dec.parentElement.classList.contains('t-cta-row'));
  check('#cta-dec has an accessible name — the glyph carries no text',
    (dec.getAttribute('aria-label') || '').length > 0);
  check('the X glyph is hidden from assistive tech',
    !!dec.querySelector('svg[aria-hidden="true"]'));

  // ---- disabled with nothing to refuse ------------------------------------
  A.newFleet('austin', { keepCompanyCash: true });
  S.offers.length = 0;
  A.render();
  check('with no offers, Decline is disabled', dec.disabled === true);

  // ---- enabled, and it names the ride it would refuse ---------------------
  S.cash = 100000; A.PROG().companyCash = 100000;
  A.acquire('cab', 'buy');
  const zs = A.zones();
  function offer(id, plat, fare, from) {
    return { id: id, from: from, to: zs[1].n, p: [zs[0].lat, zs[0].lng],
      d: [zs[1].lat, zs[1].lng], km: 5, fare: fare, wait: 0, car: null,
      plat: plat, left: 45 };
  }
  /* Two offers whose ranking FLIPS between gross fare and net of commission:
     Hitchr takes 25%, Zipp 15%. $100 gross on Hitchr nets $75; $90 gross on
     Zipp nets $76.50. A comparator that forgot the cut would pick the wrong
     one, and the button would name a ride it does not decline. */
  S.offers.length = 0;
  S.offers.push(offer('gross-winner', 'hitchr', 100, 'Rainey Street'));
  S.offers.push(offer('net-winner', 'zipp', 90, 'UT campus'));
  const net = S.offers.slice().sort((a, b) => A.offerNet(b) - A.offerNet(a))[0];
  check('setup: the two offers really do rank differently gross vs net',
    net.id === 'net-winner',
    `offerNet picked ${net.id} — check the platform cuts in this build`);

  A.render();
  check('with an offer pending, Decline is enabled', dec.disabled === false);
  check('the CTA names the best offer NET of commission',
    $('cta-main').textContent.indexOf('UT campus') >= 0,
    `CTA read: "${$('cta-main').textContent}"`);
  check('Decline\'s tooltip names the same ride the CTA does',
    (dec.title || '').indexOf('UT campus') >= 0, `title was: "${dec.title}"`);

  // ---- clicking it declines THAT offer, and only that one ------------------
  const hitchr = A.platform('hitchr'), zipp = A.platform('zipp');
  const zippAcceptedBefore = zipp.accepted;
  const logBefore = S.log.length;
  dec.click();
  check('the offer the button named is gone', !S.offers.some((o) => o.id === 'net-winner'));
  check('the other offer is untouched — one press, one ride',
    S.offers.length === 1 && S.offers[0].id === 'gross-winner');
  check('it was declined, not accepted — the platform\'s accepted count held',
    zipp.accepted === zippAcceptedBefore);
  check('it did not silently become a ride', !S.rides.some((r) => r.id === 'net-winner'));
  check('it went through declineOffer() — the feed logged it',
    S.log.length > logBefore && /declined/i.test(S.log[0].what),
    `newest log entry: ${S.log[0] && S.log[0].what}`);

  // ---- the two controls stay in step -------------------------------------
  A.render();
  check('Decline now names the remaining ride',
    (dec.title || '').indexOf('Rainey Street') >= 0, `title was: "${dec.title}"`);
  dec.click();
  A.render();
  check('declining the last offer empties the queue', S.offers.length === 0);
  check('and Decline disables itself again', dec.disabled === true);
  /* Deliberately NOT "Accept is disabled too". Off-shift the blue button is
     "Clock on" and stays live with an empty queue — that asymmetry is the
     point of #cta-dec having its own rule (`!top`) instead of reusing
     #cta's (`S.onClock ? !top : false`). Assert the rule, not a coincidence. */
  check('Accept mirrors Decline only while on shift; off-shift it stays live as Clock on',
    S.onClock ? cta.disabled === true : cta.disabled === false,
    `onClock=${S.onClock} cta.disabled=${cta.disabled}`);

  // ---- off shift ---------------------------------------------------------
  /* Off-shift the blue button becomes "Clock on", so there is no ride named
     beside it for the X to refuse. It must not sit there red and armed. */
  if (S.onClock) A.clockOff();
  S.offers.length = 0;
  A.render();
  check('off-shift with no offers, Decline is disabled', dec.disabled === true);
  check('off-shift the CTA is the red Clock-on affordance, not Accept',
    cta.classList.contains('off') &&
      $('cta-main').textContent.indexOf('Clock on') >= 0);

  /* On shift with an empty queue is the one case where the two agree. Poked
     rather than clockOn()'d: before 06:00 clockOn() starts the fast-forward,
     which is a whole other code path and not what is under test here. */
  S.onClock = true;
  S.offers.length = 0;
  A.render();
  check('on shift with an empty queue, both controls are disabled',
    cta.disabled === true && dec.disabled === true);
  S.offers.push(offer('lone', 'zipp', 40, 'Rainey St'));
  A.render();
  check('on shift with one offer, both controls are live',
    cta.disabled === false && dec.disabled === false);

  /* Explicit exit, as in soloseat.test.js: the game's tick loop and the
     jsdom window keep timers alive, so node never drains its event loop on
     its own and a passing run would simply hang. */
  console.log(failures === 0
    ? 'All Decline-button checks passed.'
    : `${failures} Decline-button check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
