const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const GAME=path.join('/sessions/optimistic-nifty-bohr/mnt/GAME Tesla Fleet Management','deadhead.html');
function ls(h){return h.replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i,'').replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i,'').replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi,'')}
(async()=>{
  const dom=new JSDOM(ls(fs.readFileSync(GAME,'utf8')),{url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,
    beforeParse(w){w.matchMedia=w.matchMedia||function(q){return{matches:false,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}};w.fetch=()=>Promise.reject(new Error('x'))}});
  await new Promise(r=>setTimeout(r,60));
  const w=dom.window;
  const tb=w.document.querySelector('.topbar');
  // Direct text nodes of .topbar and .tb-ctrls = leaked comment text
  const leaks=[];
  w.document.querySelectorAll('.topbar, .tb-ctrls, .tb-info, #settings-pop').forEach(el=>{
    [].slice.call(el.childNodes).forEach(n=>{
      if(n.nodeType===3 && n.textContent.trim()) leaks.push(el.className+' :: "'+n.textContent.trim().slice(0,60)+'"');
    });
  });
  console.log('stray text nodes:', leaks.length?leaks:'none');
  console.log('topbar textContent:', JSON.stringify(tb.textContent.replace(/\s+/g,' ').trim()));
  process.exit(0);
})();
