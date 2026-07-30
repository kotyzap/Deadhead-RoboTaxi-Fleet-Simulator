/* Flaky Connect/Accept clicks, and clockOn() wedging permanently on an error.
 *
 * WHAT THIS PROTECTS
 *
 * Pavel (2026-07-30): "Sometimes I really cannot sign in to the riding app
 * such as Zapp [Zipp]. I have to click like 30 times." and "Accepting works
 * 90% but sometimes I have to click several times." Root cause: #plat-rows
 * and #offer-list were reassigned wholesale via innerHTML on EVERY render()
 * call — every ~100ms while paused (render() runs every tick when
 * !S.running), every ~200ms while running. innerHTML replaces every child
 * node, including whichever button is mid-press; several browsers do not
 * fire `click` when the pressed element is removed from the DOM between
 * mousedown and mouseup. Connect is usually clicked while paused (100ms
 * cadence — worse odds, matches "~30 clicks"); Accept is usually clicked
 * while running (200ms cadence — better odds, matches "~90%").
 *
 * Fix: a dirty-check (lastPlatSig/lastOfferSig, mirroring the existing
 * lastMsgSeenCount pattern for the Messages panel) skips the innerHTML
 * reassignment whenever nothing that actually reaches the template changed.
 * A rebuild only happens when there is something genuinely new to show —
 * which is the one case where losing a click to it is acceptable, because
 * the button the player was aiming at may have just moved anyway.
 *
 * Also: Pavel separately hit a completely dead Clock On button in Tampa
 * after playing several other cities — "simply cannot start the shift by
 * clicking Clock on". clockOn() sets S.onClock=true as its FIRST statement,
 * then calls newDay()/render() with no error handling; if either throws,
 * onClock is already true, so clockOn()'s own guard
 * (`if(S.onClock||...) return`) silently swallows every subsequent click
 * forever, and render() never reached the line that flips the button's own
 * label — so the button still reads "Clock on", looking perfectly
 * clickable, while doing nothing. Whatever throws in any given case,
 * clockOn() must never wedge like that — it now reverts onClock (and
 * shiftNo) and surfaces a toast instead of failing silently.
 *
 * Run: node test/click-reliability.test.js  (or: npm test)
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
  console.log('click reliability: dirty-checked panels + clockOn hardening');

  const dom = new JSDOM(loadableScript(fs.readFileSync(GAME, 'utf8')), {
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
    !!A && typeof A.render === 'function' && typeof A.clockOn === 'function');
  if (!A) { process.exit(1) }

  function fresh() {
    A.newFleet('austin');
    S.ray.skipped = true;
    S.cash = 100000; A.PROG().companyCash = 100000;
    $('garage').hidden = true;
    S.offers.length = 0; S.rides.length = 0;
    return S;
  }

  // ==== 1. #plat-rows does not rebuild when nothing changed ================
  fresh();
  A.platform('zipp').on = false;
  A.render();
  const platRow = $('plat-rows').firstElementChild;
  check('setup: #plat-rows has at least one row', !!platRow);
  platRow.setAttribute('data-marker', 'untouched');
  A.render();
  check('a second render() with nothing changed does NOT rebuild #plat-rows — ' +
    'the marker survives only if innerHTML was never reassigned',
    $('plat-rows').firstElementChild &&
    $('plat-rows').firstElementChild.getAttribute('data-marker') === 'untouched');

  // ...but a REAL change (connecting a platform) still rebuilds it.
  A.platform('zipp').on = true;
  A.render();
  check('a genuine change (platform connected) DOES rebuild #plat-rows',
    !$('plat-rows').firstElementChild ||
    $('plat-rows').firstElementChild.getAttribute('data-marker') !== 'untouched');
  check('...and the row now shows the connected state',
    $('plat-rows').innerHTML.includes('>On<'));

  // ==== 2. #offer-list does not rebuild every tick for an unmoved countdown =
  fresh();
  A.PLATFORMS.forEach(function (p) { p.on = true; });
  S.onClock = true;
  const zs = A.zones();
  const o = { id: 'test-off-1', from: zs[0].n, to: zs[1].n,
    p: [zs[0].lat, zs[0].lng], d: [zs[1].lat, zs[1].lng], km: 5, fare: 40,
    wait: 0, car: null, plat: 'zipp', left: 44.7, leftInit: 45 };
  S.offers.push(o);
  A.render();
  const offerBtn = $('offer-list').querySelector('[data-acc]');
  check('setup: the offer rendered with an Accept button', !!offerBtn);
  offerBtn.setAttribute('data-marker', 'untouched');

  // The countdown float moves, but Math.ceil() of it does not cross an
  // integer boundary — the DISPLAYED "Xs" text is identical either way.
  o.left = 44.3;
  A.render();
  check('a sub-second countdown tick that does not change the displayed ' +
    'number does NOT rebuild #offer-list',
    $('offer-list').querySelector('[data-acc]') &&
    $('offer-list').querySelector('[data-acc]').getAttribute('data-marker') === 'untouched');

  // Once the displayed number actually changes, a rebuild is expected (and
  // fine — the countdown text itself just changed, so the player is looking
  // at new information regardless).
  o.left = 43.9;
  A.render();
  check('...but crossing the displayed integer boundary DOES rebuild it',
    !$('offer-list').querySelector('[data-acc]') ||
    $('offer-list').querySelector('[data-acc]').getAttribute('data-marker') !== 'untouched');
  check('...and shows the new countdown value',
    $('offer-list').innerHTML.includes('>44s<'));

  // ==== 3. clockOn() must never wedge on an internal error =================
  fresh();
  const tbDay = $('tb-day');
  const tbDayParent = tbDay.parentElement;
  const tbDayNext = tbDay.nextSibling;
  tbDay.remove();          // render() does $('tb-day').textContent=... — now throws
  const shiftNoBefore = S.shiftNo;
  A.clockOn();
  check('a render() failure during clockOn() does not leave onClock stuck true',
    S.onClock === false, `S.onClock=${S.onClock}`);
  check('...shiftNo is reverted too, not left incremented for a shift that never started',
    S.shiftNo === shiftNoBefore, `${shiftNoBefore} -> ${S.shiftNo}`);
  check('...and the player sees WHY, via a toast, instead of silence',
    $('sv-toast').textContent.includes('Could not start the shift'),
    $('sv-toast').textContent);

  // Restore the element and confirm the game is not permanently broken —
  // clocking on now must actually work.
  if (tbDayNext) tbDayParent.insertBefore(tbDay, tbDayNext);
  else tbDayParent.appendChild(tbDay);
  A.clockOn();
  check('once the underlying problem is gone, clocking on succeeds normally',
    S.onClock === true, `S.onClock=${S.onClock}`);

  console.log(failures === 0
    ? 'All click-reliability checks passed.'
    : `${failures} click-reliability check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
