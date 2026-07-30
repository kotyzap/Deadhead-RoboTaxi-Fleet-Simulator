const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const GAME = path.join(__dirname, '..', 'deadhead.html');
function loadableScript(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '')
    .replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi, '');
}
(async () => {
  const dom = new JSDOM(loadableScript(fs.readFileSync(GAME, 'utf8')), {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      window.fetch = () => Promise.reject(new Error('offline'));
      window.confirm = () => true;
    },
  });
  await new Promise(r=>setTimeout(r,80));
  const w = dom.window, A = w.DH_ACT1, S = w.DH;
  A.newFleet('dallas', {keepCompanyCash:true});
  S.ray.skipped = true;
  if (A.render) A.render();
  const panel = w.document.getElementById('panel-fleet');
  console.log('panel classes:', panel.className);
  console.log('buy disabled attr:', w.document.getElementById('buy').disabled);
  const cs = w.getComputedStyle(w.document.getElementById('buy'));
  console.log('buy pointer-events computed:', cs.pointerEvents);
  process.exit(0);
})();
