const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const GAME=path.join('/sessions/optimistic-nifty-bohr/mnt/GAME Tesla Fleet Management','deadhead.html');
function ls(h){return h.replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i,'').replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i,'').replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi,'')}
(async()=>{
  const dom=new JSDOM(ls(fs.readFileSync(GAME,'utf8')),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.matchMedia=w.matchMedia||function(q){return{matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}};w.fetch=()=>Promise.reject(new Error('x'))}});
  await new Promise(r=>setTimeout(r,60));
  const w=dom.window,$=id=>w.document.getElementById(id);
  const pop=$('settings-pop'), gear=$('settings-btn');
  console.log('pop parent:', pop.parentElement.tagName, pop.parentElement.className||'(body)');
  console.log('pop inside .app?', !!pop.closest('.app'), '| inside .topbar?', !!pop.closest('.topbar'));
  console.log('topbar children:', [].slice.call(w.document.querySelector('.topbar').children).map(e=>e.className||e.id).join(' | '));
  console.log('initial hidden:', pop.hidden, 'aria-expanded:', gear.getAttribute('aria-expanded'));
  gear.click();
  console.log('after gear click -> hidden:', pop.hidden, 'aria-expanded:', gear.getAttribute('aria-expanded'));
  // click inside must NOT close
  $('theme').click();
  console.log('after theme click inside -> still open:', !pop.hidden, '| theme tag:', $('theme-tag').textContent, 'icon', $('theme').querySelector('use').getAttribute('href'));
  $('sound').click();
  console.log('after sound click -> still open:', !pop.hidden, '| sound tag:', $('sound-tag').textContent);
  $('units').click();
  console.log('after units click -> still open:', !pop.hidden, '| units tag:', $('units-tag').textContent);
  // outside click closes
  w.document.body.click();
  console.log('after outside click -> hidden:', pop.hidden, 'aria-expanded:', gear.getAttribute('aria-expanded'));
  // escape
  gear.click();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
  console.log('after Escape -> hidden:', pop.hidden);
  // toggle closed by re-click
  gear.click(); gear.click();
  console.log('after double gear click -> hidden:', pop.hidden);
  process.exit(0);
})();
