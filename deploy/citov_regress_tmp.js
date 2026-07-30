const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const GAME = '/sessions/zealous-inspiring-maxwell/mnt/GAME Tesla Fleet Management/deadhead.html';
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
        return { matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} };
      };
      window.fetch = () => Promise.reject(new Error('offline in test'));
    },
  });
  await new Promise(r => setTimeout(r, 60));
  const w = dom.window, $ = id => w.document.getElementById(id);
  $('citov-btn').click();
  console.log('modal hidden?', $('cities-overview').hidden);
  console.log('pin count', w.document.querySelectorAll('.citov-pin').length);
  console.log('count text', $('citov-count').textContent);
  const pins = Array.from(w.document.querySelectorAll('.citov-pin')).map(p => p.dataset.city + ':' + p.className.baseVal);
  console.log(pins.join('\n'));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT GUARD FIRED'); process.exit(2); }, 8000);
