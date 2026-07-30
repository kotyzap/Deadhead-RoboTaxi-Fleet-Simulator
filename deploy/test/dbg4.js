const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const GAME=path.join('/sessions/optimistic-nifty-bohr/mnt/GAME Tesla Fleet Management','deadhead.html');
function ls(h){return h.replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i,'').replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i,'').replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi,'')}
(async()=>{
  const dom=new JSDOM(ls(fs.readFileSync(GAME,'utf8')),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.matchMedia=w.matchMedia||function(q){return{matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}};w.fetch=()=>Promise.reject(new Error('x'))}});
  await new Promise(r=>setTimeout(r,60));
  const w=dom.window,A=w.DH_ACT1,S=w.DH,$=id=>w.document.getElementById(id);
  A.newFleet('austin'); S.cash=1e6; A.PROG().companyCash=1e6; A.acquire('cab','buy');
  // Pavel's shift: 1.3h worked, 15 rides, 36mi, gross 143.80, net -227.92
  A.setHistory([
    {ts:Date.now(),city:'austin',shiftNo:1,workedH:1.3,billedH:24,gross:143.8,commission:35.95,cost:371.73,net:-227.92,miles:36,rides:15,safety:88,cash:518,cars:1},
    {ts:Date.now(),city:'austin',shiftNo:2,workedH:1.3,billedH:24,gross:143.8,commission:35.95,cost:371.73,net:-227.92,miles:36,rides:15,safety:88,cash:518,cars:1}
  ]);
  Object.assign(S.d,{done:15,gross:143.8,commission:35.95,energy:3.36,dep:10,maint:3,ins:4,soft:1.42,fixed:314,cost:371.73,miles:36,cancels:0});
  S.workedSec=1.3*3600; S.billedSec=24*3600;
  A.shiftReport();
  const html=$('rp-body').innerHTML;
  console.log('--- viewBox:', (html.match(/viewBox="[^"]+"/)||[])[0]);
  console.log('--- svg w/h:', (html.match(/width="\d+" height="\d+"/)||[])[0]);
  console.log('--- rp-row count:', (html.match(/class="rp-row"/g)||[]).length);
  console.log('--- rp-mini count:', (html.match(/class="rp-mini"/g)||[]).length);
  console.log('--- has rp-top:', /rp-top/.test(html), '| ghost:', /stroke-dasharray/.test(html));
  console.log('--- ghost text:', (html.match(/<div class="rp-ghost">.*?<\/div>/)||[])[0]);
  // rough height estimate: rows 21px, seps 19, radar 228, legend 24, minis 3*26
  const rows=(html.match(/class="rp-row"/g)||[]).length, seps=(html.match(/rp-sep/g)||[]).length;
  console.log('--- est body height:', rows*21+seps*19+228, 'px  (sheet max-height 86vh; at 900px viewport = 774, minus title/buttons ~120 => ~654 avail)');
  process.exit(0);
})();
