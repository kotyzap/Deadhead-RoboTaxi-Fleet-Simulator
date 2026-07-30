const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const GAME=path.join('/sessions/optimistic-nifty-bohr/mnt/GAME Tesla Fleet Management','deadhead.html');
function ls(h){return h.replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i,'').replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i,'').replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi,'')}
(async()=>{
  const dom=new JSDOM(ls(fs.readFileSync(GAME,'utf8')),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.matchMedia=w.matchMedia||function(q){return{matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}};w.fetch=()=>Promise.reject(new Error('x'));w.open=()=>null}});
  await new Promise(r=>setTimeout(r,60));
  const w=dom.window,$=id=>w.document.getElementById(id),S=w.DH;
  console.log('topbar children:',[].slice.call(w.document.querySelector('.topbar').children).map(e=>e.className).join(' | '));
  console.log('coffee in popover?',!!$('coffee').closest('#settings-pop'),'| in topbar?',!!$('coffee').closest('.topbar'));
  console.log('popover rows:',[].slice.call($('settings-pop').querySelectorAll('.set-row')).map(r=>r.querySelector('.set-lbl').textContent).join(', '));
  // open menu, click coffee -> menu closes, ray opens as coffee card
  S.ray.skipped=false;
  $('settings-btn').click();
  console.log('menu open:',!$('settings-pop').hidden);
  $('coffee').click();
  console.log('after coffee click -> menu hidden:',$('settings-pop').hidden,'| ray hidden:',$('ray').hidden,'| ray.cur:',S.ray.cur);
  console.log('ray placed at top:',$('ray').style.top,'left:',$('ray').style.left,'(should be near the gear, not 0)');
  const gr=$('settings-btn').getBoundingClientRect();
  console.log('gear rect bottom:',gr.bottom,'right:',gr.right);
  process.exit(0);
})();
