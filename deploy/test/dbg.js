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
  S.ray.guided=false; S.ray.day1Done=true; S.ray.skipped=false;
  S.ray.seen = A.RAY.map(b=>b.n);
  S.cash=1e6; A.PROG().companyCash=1e6;
  A.acquire('cab','buy');
  $('garage').hidden=true;
  $('ray').hidden=true; S.ray.cur=null; $('ray-text').innerHTML='';
  A.PLATFORMS.forEach(p=>{p.on=false});
  S.onClock=true; S.shiftNo=1; S.offers.length=0; S.rides.length=0;
  console.log('before click: ray hidden=', $('ray').hidden, 'cur=', S.ray.cur, 'onClock=', S.onClock);
  $('clock').click();
  console.log('after click: ray hidden=', $('ray').hidden, 'cur=', S.ray.cur, 'onClock=', S.onClock);
  console.log('ray-text:', $('ray-text').innerHTML);
  process.exit(0);
})();
