const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const GAME=path.join('/sessions/optimistic-nifty-bohr/mnt/GAME Tesla Fleet Management','deadhead.html');
function ls(h){return h.replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i,'').replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i,'').replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi,'')}
(async()=>{
  const dom=new JSDOM(ls(fs.readFileSync(GAME,'utf8')),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.matchMedia=w.matchMedia||function(q){return{matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}};w.fetch=()=>Promise.reject(new Error('x'))}});
  await new Promise(r=>setTimeout(r,60));
  const w=dom.window,$=id=>w.document.getElementById(id);
  const show=(id)=>{const b=$(id);return id+': text="'+b.textContent.trim()+'" icon='+b.querySelector('use').getAttribute('href')+' title="'+b.getAttribute('title')+'" aria="'+b.getAttribute('aria-label')+'" cls='+b.className};
  ['theme','sound','coffee'].forEach(id=>console.log(show(id)));
  console.log('--- click theme ---');
  $('theme').click(); console.log(show('theme'));
  $('theme').click(); console.log(show('theme'));
  console.log('--- click sound ---');
  $('sound').click(); console.log(show('sound'));
  $('sound').click(); console.log(show('sound'));
  console.log('--- labels still on Garage/Saves? ---');
  console.log('garage text="'+$('garage-btn').textContent.trim()+'" saves text="'+$('saves').textContent.trim()+'"');
  process.exit(0);
})();
