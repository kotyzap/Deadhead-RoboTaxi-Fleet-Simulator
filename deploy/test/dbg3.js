const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const GAME = path.join('/sessions/optimistic-nifty-bohr/mnt/GAME Tesla Fleet Management', 'deadhead.html');
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
      window.matchMedia = window.matchMedia || function (q) { return { matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} } };
      window.fetch = () => Promise.reject(new Error('offline'));
    },
  });
  await new Promise(r=>setTimeout(r,60));
  const w = dom.window; const A = w.DH_ACT1; const S = w.DH; const $=(id)=>w.document.getElementById(id);
  A.newFleet('austin');
  A.openTrophies();
  console.log('trophies open: X hidden=', $('dh-cp-close').hidden);
  A.closeConsolePanel();
  A.showInConsole('panel-fleet','Fleet');
  console.log('fleet open: X hidden=', $('dh-cp-close').hidden);
  process.exit(0);
})();
