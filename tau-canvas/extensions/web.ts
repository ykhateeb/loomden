// Browser-side code, kept as strings so the extension is plain TS files with no build step.

/** Injected into every board. Point mode outlines the element under the mouse; a click reports it to the viewer. */
export const POINT_SCRIPT = `(()=>{
let mode="move";
const box=document.createElement("div");
box.style.cssText="position:fixed;pointer-events:none;border:2px solid #4e6f94;background:rgba(78,111,148,.12);z-index:2147483647;display:none";
document.documentElement.append(box);
const tgt=e=>e.target.closest&&e.target.closest("[data-tid]");
addEventListener("message",e=>{if(e.data&&e.data.type==="mode"){mode=e.data.mode;if(mode!=="point"&&mode!=="edit")box.style.display="none"}});
const label=t=>(t.innerText||t.getAttribute("aria-label")||t.tagName).trim().slice(0,60);
const info=t=>{const r=t.getBoundingClientRect();return{tid:t.dataset.tid,text:label(t),box:[r.left,r.top,r.width,r.height].map(Math.round),
tag:t.tagName.toLowerCase(),canText:!t.children.length&&!!t.textContent.trim(),full:t.textContent.trim().slice(0,500),style:t.getAttribute("style")||""}};
const aiming=()=>mode==="point"||mode==="edit";
addEventListener("mouseover",e=>{if(!aiming())return;const t=tgt(e);if(!t)return;const r=t.getBoundingClientRect();
Object.assign(box.style,{display:"block",left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"})},true);
addEventListener("click",e=>{const a=e.target.closest&&e.target.closest("a[href]");if(a)e.preventDefault(); // a board never navigates by itself
if(mode==="play"){if(a)parent.postMessage({type:"go",href:a.getAttribute("href")},"*");return}
if(!aiming())return;e.preventDefault();e.stopPropagation();const t=tgt(e);if(!t)return;
const i=info(t);parent.postMessage(mode==="point"?{type:"pick",tid:i.tid,text:i.text,box:i.box}:Object.assign({type:"select"},i),"*")},true);
addEventListener("dblclick",e=>{if(mode!=="edit")return;const t=tgt(e);if(!t||t.children.length||!t.textContent.trim())return;
const was=t.textContent;t.contentEditable="true";t.focus();
const done=()=>{t.removeEventListener("blur",done);t.contentEditable="false";if(t.textContent!==was)parent.postMessage({type:"text",tid:t.dataset.tid,text:t.textContent},"*")};
t.addEventListener("blur",done);t.addEventListener("keydown",k=>{if(k.key==="Enter"){k.preventDefault();t.blur()}})},true);
addEventListener("submit",e=>e.preventDefault(),true);
// the frame owns the keyboard after a click: pass the play keys on
addEventListener("keydown",e=>{if(mode!=="play"||!["r","Backspace","Escape"].includes(e.key))return;e.preventDefault();parent.postMessage({type:"key",key:e.key},"*")},true);
const marks=[];
function show(vars){
marks.forEach(m=>m.remove());marks.length=0;if(!vars||!vars.length)return;
const uses=s=>vars.some(v=>s.includes("var(--"+v+")")||s.includes("var(--"+v+","));
const hit=new Set();
document.querySelectorAll("[data-tid]").forEach(el=>{if(uses(el.getAttribute("style")||""))hit.add(el)});
for(const ss of document.styleSheets)try{for(const r of ss.cssRules)if(r.selectorText&&uses(r.cssText))try{document.querySelectorAll(r.selectorText).forEach(el=>hit.add(el))}catch(e){}}catch(e){}
hit.forEach(el=>{const b=el.getBoundingClientRect(),m=document.createElement("div");
m.style.cssText="position:fixed;pointer-events:none;border:2px dashed #d9822b;background:rgba(217,130,43,.15);z-index:2147483646;left:"+b.left+"px;top:"+b.top+"px;width:"+b.width+"px;height:"+b.height+"px";
marks.push(m);document.documentElement.append(m)})}
addEventListener("message",e=>{const d=e.data;if(!d)return;if(d.type==="show")show(d.vars);
if(d.type==="reselect"){const t=document.querySelector('[data-tid="'+d.tid+'"]');if(t)parent.postMessage(Object.assign({type:"select"},info(t)),"*")}});
})();`;

/** The canvas viewer. __BASE__ and __CANVAS__ are replaced by the server. */
export const VIEWER = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas</title>
<style>
:root{color-scheme:dark;--bg:#161b22;--fg:#e9ecf1;--mut:#8a95a4;--card:#1d232d;--line:#29313d;--acc:#82aedc;--accfg:#0c1420}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,sans-serif;overflow:hidden}
header{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--card)}
header nav{display:flex;gap:4px;margin-right:auto;overflow-x:auto}
header nav a,header nav button{white-space:nowrap;text-decoration:none;color:inherit}
header nav sup{color:var(--mut);margin-left:4px}
header nav .on sup{color:inherit}
.seg{display:inline-flex;gap:2px;border:1px solid var(--line);border-radius:8px;padding:2px}
.seg button{border:0;background:none}
kbd{font:11px ui-monospace,monospace;color:var(--mut);margin-left:4px}
.on kbd{color:inherit}
#hint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;display:none;gap:10px;box-shadow:0 8px 24px #0004}
#hint b{display:block}
footer{display:flex;gap:12px;align-items:center;padding:6px 12px;border-top:1px solid var(--line);background:var(--card);color:var(--mut)}
footer code{font:12px ui-monospace,monospace}
.chips{display:flex;gap:4px}
.chips button{padding:2px 8px}
.note.work{border-color:var(--acc)}
button{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
button.on,button.primary{background:var(--acc);border-color:var(--acc);color:var(--accfg);font-weight:600}
main{flex:1;display:flex;min-height:0}
#stage{flex:1;position:relative;overflow:hidden;touch-action:none}
#world{position:absolute;left:0;top:0;transform-origin:0 0}
.board{position:absolute}
.board .lbl{position:absolute;top:-20px;left:0;color:var(--mut);white-space:nowrap}
.board iframe{border:1px solid var(--line);background:#fff;display:block}
body.move iframe{pointer-events:none}
body.point #stage,body.edit #stage{cursor:crosshair}
#player{display:none;position:absolute;inset:0;flex-direction:column;align-items:center;gap:8px;padding:12px;overflow:hidden}
#player .bar{display:flex;gap:8px;align-items:center;color:var(--mut)}
#player iframe{border:1px solid var(--line);background:#fff;transform-origin:0 0}
body.play #world,body.play #hint{display:none}
body.play #player{display:flex}
#cmp{display:none;flex:1;overflow:auto;padding:16px;gap:16px}
body[data-view=compare] #cmp{display:flex}
body[data-view=compare] #stage,body[data-view=compare] aside,body[data-view=compare] .modes .seg:first-child,body[data-view=app] #stage,body[data-view=app] aside,body[data-view=app] .modes .seg:first-child,body[data-tab=ds] #cmp,body[data-tab=ds] .views{display:none}
#appcmp{display:none;flex:1;overflow:auto;padding:16px;gap:16px}
body[data-view=app] #appcmp{display:flex}
#appcmp .tabs{display:flex;gap:4px;margin-bottom:8px}
#appcmp .shot{border:1px dashed var(--line);display:grid;place-items:center;color:var(--mut)}
#appcmp img{display:block}
#cmp .pair{display:flex;gap:16px;align-items:flex-start}
#cmp .col{display:flex;flex-direction:column;gap:6px;color:var(--mut)}
#cmp .col>div{overflow:hidden;border:1px solid var(--line)}
#cmp iframe{border:0;background:#fff;transform-origin:0 0;display:block;pointer-events:none}
#cmp .side{width:300px;display:flex;flex-direction:column;gap:8px;flex:none}
#cmp .side .row{display:flex;justify-content:space-between;align-items:center;gap:6px}
.ok{color:#65c38b}.warn{color:#e5b773}.bad{color:#ee9075}
.linkrow{border:1px solid var(--line);border-radius:8px;padding:6px 8px}
#toast{position:fixed;left:50%;bottom:48px;transform:translateX(-50%);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;display:none;z-index:20}
#hist{position:fixed;z-index:10;min-width:240px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:0 8px 24px #0004;display:none;flex-direction:column;gap:6px}
.lbl{cursor:pointer}
aside label{color:var(--mut);font-size:12px;margin-top:4px}
aside input,aside select{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:5px 6px;width:100%}
.pin{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--acc);color:var(--accfg);font-size:11px;display:grid;place-items:center}
.pin.done{opacity:.4}
aside{width:300px;border-left:1px solid var(--line);background:var(--card);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.note{border:1px solid var(--line);border-radius:8px;padding:8px}
.note.done{opacity:.55}
.note small{color:var(--mut);display:block}
#ds{display:none;flex:1;overflow:auto;padding:16px;max-width:860px}
body[data-tab=ds] #ds{display:block}
body[data-tab=ds] #stage,body[data-tab=ds] aside,body[data-tab=ds] .modes{display:none}
#ds h3{margin:20px 0 8px;color:var(--mut);font-weight:600}
.dstop{display:flex;gap:8px;align-items:center;justify-content:space-between}
.tokens{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.tok{display:flex;gap:8px;align-items:center;text-align:left;padding:8px}
.tok.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
.tok small{display:block;color:var(--mut)}
.sw{width:28px;height:28px;border-radius:6px;border:1px solid var(--line);flex:none;background:var(--bg)}
.prop,.detail{border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:12px;background:var(--card);display:flex;flex-direction:column;gap:6px}
.prop{border-color:#d9822b}
.row{display:flex;gap:6px}
#pop{position:fixed;z-index:10;width:280px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:0 8px 24px #0003;display:none;flex-direction:column;gap:8px}
#pop textarea{width:100%;height:70px;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px}
#pop div{display:flex;gap:6px}
</style></head>
<body class="move">
<header><nav id="tabs"></nav>
<span class="modes"><span class="seg"><button id="m-move" class="on">Move <kbd>V</kbd></button><button id="m-point">Point <kbd>P</kbd></button><button id="m-edit">Edit <kbd>E</kbd></button><button id="m-play">Play ▶</button></span> <span class="seg views"><button id="v-canvas" class="on">Canvas</button><button id="v-compare">Compare</button><button id="v-app">App</button></span> <span id="zoom"></span></span></header>
<main><div id="stage"><div id="world"></div><div id="player"></div><div id="hint"><span><b>This is a first draft.</b>Press <kbd>P</kbd> and click anything to ask for a change. Nothing is built until you approve.</span><button id="hint-x" aria-label="Dismiss">×</button></div></div><aside id="side"></aside><section id="ds"></section><section id="cmp"></section><section id="appcmp"></section></main>
<footer id="foot"></footer>
<div id="pop"></div><div id="hist"></div><div id="toast"></div>
<script>
const B="__BASE__",C="__CANVAS__";
let cv,mode="move",view={x:40,y:50,k:.6},bust=0,pending=null;
const frames=new Map();
const $=s=>document.querySelector(s);
const h=(t,p={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(p)){if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(k==="class")e.className=v;else e.setAttribute(k,v)}e.append(...kids);return e};
const post=(path,body)=>fetch(B+"/api/"+path,{method:"POST",body:JSON.stringify({canvas:C,...body})}).then(r=>r.ok?r.json():r.text().then(t=>{throw new Error(t)}));
let toastT;const toast=m=>{const t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(toastT);toastT=setTimeout(()=>t.style.display="none",4000)};
addEventListener("unhandledrejection",e=>toast(e.reason&&e.reason.message||"Something went wrong"));

let tell=true,all=[],nf="open",hintOff=false,curNotes=[],selected=null,lastMine=null;
async function load(){[cv,all]=await Promise.all([fetch(B+"/c/"+C+"/canvas.json").then(r=>r.json()),fetch(B+"/canvases.json").then(r=>r.json())]);render()}
function renderTabs(){
  const nav=$("#tabs");nav.replaceChildren();
  for(const c of all){
    const cur=c.slug===C,sup=c.open?h("sup",{},String(c.open)):"";
    nav.append(cur?h("button",{class:tab==="canvas"?"on":"",onclick:()=>setTab("canvas")},c.title,sup):h("a",{href:B+"/c/"+c.slug},h("button",{},c.title,sup)))}
  nav.append(h("button",{id:"t-ds",class:tab==="ds"?"on":"",onclick:()=>setTab("ds")},"Design system"))}
const ago=iso=>Date.now()-new Date(iso).getTime()<60000;
let fresh;
function applyView(){$("#world").style.transform="translate("+view.x+"px,"+view.y+"px) scale("+view.k+")";$("#zoom").textContent=Math.round(view.k*100)+"%"}
function setMode(m){mode=m;document.body.className=m;for(const k of["move","point","edit","play"])$("#m-"+k).classList.toggle("on",m===k);
if(m==="edit"&&!ds)loadDs();if(m==="play")startPlay();if(cv)renderSide(curNotes);
for(const f of frames.values())f.iframe.contentWindow&&f.iframe.contentWindow.postMessage({type:"mode",mode:m},"*")}

function render(){
  renderTabs();
  clearTimeout(fresh);fresh=setTimeout(render,61000); // "just updated" ends after a minute
  const world=$("#world");
  for(const[key,f]of frames)if(!cv.boards[key]){f.wrap.remove();frames.delete(key)}
  for(const[key,b]of Object.entries(cv.boards)){
    let f=frames.get(key);
    if(!f){
      const iframe=h("iframe",{sandbox:"allow-scripts"});
      iframe.addEventListener("load",()=>{iframe.contentWindow.postMessage({type:"mode",mode},"*");
        if(selected&&selected.board===key)iframe.contentWindow.postMessage({type:"reselect",tid:selected.tid},"*")});
      const lbl=h("div",{class:"lbl",title:"History",onclick:e=>{e.stopPropagation();showHistory(key,e)}});
      const wrap=h("div",{class:"board"},lbl,iframe);
      world.append(wrap);f={wrap,iframe,lbl,src:""};frames.set(key,f)
    }
    f.wrap.style.cssText="left:"+b.x+"px;top:"+b.y+"px";
    f.iframe.style.cssText="width:"+b.w+"px;height:"+b.h+"px";
    f.lbl.textContent=b.title+" rev "+b.rev+(b.by==="you"?" · edited by you":"")+(b.at&&ago(b.at)?" · just updated":"");
    const src=B+"/c/"+C+"/"+key+"?r="+b.rev+"."+bust;
    if(f.src!==src){f.src=src;f.iframe.src=src}
  }
  world.querySelectorAll(".pin").forEach(p=>p.remove());
  const notes=Object.entries(cv.notes);
  notes.forEach(([id,n],i)=>{const b=cv.boards[n.board];if(!b)return;
    const pin=h("div",{class:"pin "+n.state,title:n.text},String(i+1));
    pin.style.cssText="left:"+(b.x+n.target.box[0])+"px;top:"+(b.y+n.target.box[1])+"px";world.append(pin)});
  curNotes=notes;renderSide(notes);
  const draft=Object.values(cv.boards).length&&Object.values(cv.boards).every(b=>b.rev===1)&&!notes.length&&tab==="canvas"&&!hintOff;
  $("#hint").style.display=draft?"flex":"none";
  const open=notes.filter(([,n])=>n.state==="open").length;
  $("#foot").replaceChildren(h("code",{},".tau/canvases/"+C),h("span",{},open+" saved note"+(open===1?"":"s")))
}
$("#hint-x").onclick=()=>{hintOff=true;$("#hint").style.display="none"};
function renderSide(notes){
  const side=$("#side");side.replaceChildren();
  if(mode==="edit")return renderEdit(side);
  if(mode==="play")return renderPlay(side);
  const open=notes.filter(([,n])=>n.state==="open"),done=notes.filter(([,n])=>n.state==="done");
  const chip=(k,label,n)=>h("button",{class:nf===k?"on":"",onclick:()=>{nf=k;renderSide(notes)}},label+" "+n);
  side.append(h("div",{class:"chips"},chip("open","Open",notes.length-done.length),chip("done","Done",done.length),chip("all","All",notes.length)));
  if(open.length)side.append(h("button",{class:"primary",onclick:()=>post("send",{ids:open.map(([id])=>id)})},"Send "+open.length+" saved note"+(open.length>1?"s":"")+" to pi"));
  if(!notes.length)side.append(h("small",{},"No notes. Press P, then click an element."));
  const shown=notes.map((n,i)=>[...n,i]).filter(([,n])=>nf==="all"||(nf==="done")===(n.state==="done"));
  for(const[id,n,i]of shown){
    const st={open:"saved, not sent yet",sent:"sent",work:"pi working",done:"done"}[n.state];
    const el=h("div",{class:"note "+n.state},
      h("small",{},(i+1)+" · "+(cv.boards[n.board]?.title||n.board)+" · You · "+st),h("div",{},n.text),h("small",{},"“"+n.target.text+"”"));
    if(n.state==="done")el.append(h("button",{onclick:()=>post("state",{ids:[id],state:"open"})},"Reopen"));
    side.append(el)}
}

// edit mode: properties panel (design-system values only)
const edit=body=>post("edit",{board:selected.board,tid:selected.tid,tell,...body}).then(r=>{lastMine={board:selected.board,rev:r.rev}});
const undo=()=>lastMine?post("undo",{board:lastMine.board,rev:lastMine.rev}).then(()=>{lastMine=null;toast("Undone")}):toast("Nothing to undo");
function curVar(prop){for(const d of selected.style.split(";")){const i=d.indexOf(":");if(i>0&&d.slice(0,i).trim()===prop){const v=d.slice(i+1).trim();if(v.startsWith("var(--")&&v.endsWith(")"))return v.slice(6,-1)}}return ""}
function pick(title,items,mk,prop,name){
  const s=h("select",{"aria-label":title},h("option",{value:""},"—"));
  items.forEach((it,i)=>s.append(h("option",{value:String(i)},it.name+"  "+it.value)));
  s.append(h("option",{value:"custom"},"Custom value…"));
  const cur=curVar(prop);const at=items.findIndex(it=>it.decls.some(d=>d[0]===cur));if(at>=0)s.value=String(at);
  s.onchange=()=>{if(s.value==="custom"){post("custom",{board:selected.board,tid:selected.tid,text:selected.text,prop:title});toast("Asked pi to add it as a token");s.value=at>=0?String(at):"";return}
    if(s.value!=="")edit({style:mk(items[+s.value])})};
  return[h("label",{},title),s]}
function renderEdit(side){
  const b=selected&&cv.boards[selected.board];
  side.append(h("b",{},"Edit "+(b?b.title:"")),h("small",{},b?"rev "+b.rev+" · "+b.by:""));
  if(!selected)return side.append(h("small",{},"Click an element to edit it. Double-click text to edit it in place. ⌘Z undoes."));
  side.append(h("small",{},selected.text+" · "+selected.tag));
  if(selected.canText){const inp=h("input",{value:selected.full,"aria-label":"Text"});inp.addEventListener("change",()=>edit({text:inp.value}));side.append(h("label",{},"Text"),inp)}
  const it=ds?ds.items:[];
  const sp=it.filter(i=>i.group==="spacing");
  side.append(...pick("Text style",it.filter(i=>i.group==="type"&&i.decls.length===3),i=>({"font-size":"var(--"+i.decls[0][0]+")","line-height":"var(--"+i.decls[1][0]+")","font-weight":"var(--"+i.decls[2][0]+")"}),"font-size"),
    ...pick("Color",it.filter(i=>i.group==="color"),i=>({color:"var(--"+i.name+")"}),"color"),
    ...pick("Gap above",sp,i=>({"margin-top":"var(--"+i.name+")"}),"margin-top"),
    ...pick("Padding",sp,i=>({padding:"var(--"+i.name+")"}),"padding"),
    h("small",{},"Values come from the design system. Custom value… asks pi to add it as a token."),
    h("small",{},"Saved as a new rev by you. The file changes right away."),
    h("label",{},h("input",{id:"tell",type:"checkbox",style:"width:auto;margin-right:6px",...(tell?{checked:""}:{}),onchange:e=>{tell=e.target.checked}}),"Tell pi what I changed, with my next message"),
    h("button",{onclick:undo},"Undo ⌘Z"))}
async function showHistory(key,ev){
  const list=await fetch(B+"/c/"+C+"/history.json?board="+encodeURIComponent(key)).then(r=>r.json());
  const p=$("#hist");p.replaceChildren(h("b",{},(cv.boards[key]?.title||key)+" · history"),...list.map(e=>h("div",{},"rev "+e.rev+" · "+e.by+(e.why?" · "+e.why:""))));
  p.style.display="flex";p.style.left=Math.min(innerWidth-280,ev.clientX)+"px";p.style.top=(ev.clientY+12)+"px"}
addEventListener("click",()=>$("#hist").style.display="none");

// play: click through the boards by their links
let fl=null,stack=[];
async function startPlay(){
  fl=await fetch(B+"/c/"+C+"/flow.json").then(r=>r.json());
  stack=[];const first=fl.boards[0];if(first)playTo(first.key,true);else renderSide(curNotes)}
function playTo(key,reset){
  if(reset)stack=[];stack.push(key);
  const b=cv.boards[key],p=$("#player"),k=Math.min(1,(innerHeight-150)/b.h);
  let f=$("#pl");
  if(!f){f=h("iframe",{id:"pl",sandbox:"allow-scripts"});f.addEventListener("load",()=>f.contentWindow.postMessage({type:"mode",mode:"play"},"*"))}
  p.replaceChildren(h("div",{class:"bar"},h("b",{},"Play "+cv.title),h("span",{},b.title+" rev "+b.rev),
    h("button",{onclick:()=>startPlay()},"Restart",h("kbd",{},"R")),h("button",{onclick:()=>setMode("move")},"Exit",h("kbd",{},"esc"))),f);
  f.style.cssText="width:"+b.w+"px;height:"+b.h+"px;transform:scale("+k+");margin-bottom:"+(b.h*(k-1))+"px;margin-right:"+(b.w*(k-1))+"px";
  f.src=B+"/c/"+C+"/"+key+"?r="+b.rev+"."+bust;renderSide(curNotes)}
function playKey(k){if(k==="r")startPlay();if(k==="Backspace")playBack();if(k==="Escape")setMode("move")}
function playBack(){if(stack.length>1){stack.pop();playTo(stack.pop())}}
function renderPlay(side){
  side.append(h("b",{},"Boards"));
  if(!fl)return;
  for(const b of fl.boards)side.append(h("button",{class:stack[stack.length-1]===b.key?"on":"",onclick:()=>playTo(b.key,true)},b.title+" · rev "+b.rev));
  const miss=[...new Set(fl.links.filter(l=>!l.to).map(l=>l.name))];
  for(const m of miss)side.append(h("small",{class:"bad"},m+" · missing"));
  side.append(h("small",{},"Links between boards come from the HTML: a button with href payment.html goes there."),h("b",{},"Links in this flow "+fl.links.length));
  for(const l of fl.links){
    const row=h("div",{class:"linkrow"},h("small",{},l.fromTitle+" · “"+l.text+"”"),h("div",{},l.to?"→ "+cv.boards[l.to].title:"No board for “"+l.name+"”"));
    if(!l.to)row.append(h("button",{onclick:()=>{post("addboard",{name:l.name,from:l.fromTitle});toast("Asked pi to add it")}},"Ask pi to add it"));
    side.append(row)}
  side.append(h("small",{},"While playing: R restarts, ⌫ goes back, Esc exits. Forms and buttons work."))}

// compare, restore, approve
let view2="canvas",cmp={board:null,base:null};
function setView(v){view2=v;document.body.dataset.view=v;$("#v-canvas").classList.toggle("on",v==="canvas");$("#v-compare").classList.toggle("on",v==="compare");$("#v-app").classList.toggle("on",v==="app");if(v==="compare")loadCmp();if(v==="app")loadApp()}
async function loadCmp(){
  if(!cmp.board||!cv.boards[cmp.board])cmp.board=cv.order[0];
  const b=cv.boards[cmp.board];if(!b)return;
  const hist=(await fetch(B+"/c/"+C+"/history.json?board="+encodeURIComponent(cmp.board)).then(r=>r.json())).reverse();
  if(cmp.base==null||cmp.base>=b.rev)cmp.base=b.approved&&b.approved<b.rev?b.approved:Math.max(1,b.rev-1);
  renderCmp(b,hist)}
function renderCmp(b,hist){
  const el=$("#cmp"),name=cmp.board.slice(7,-5),k=.6;
  const frame=src=>{const f=h("iframe",{sandbox:"allow-scripts",src});f.style.cssText="width:"+b.w+"px;height:"+b.h+"px;transform:scale("+k+")";const box=h("div",{},f);box.style.cssText="width:"+b.w*k+"px;height:"+b.h*k+"px";return box};
  const sel=h("select",{"aria-label":"Board"},...cv.order.map(o=>h("option",{value:o},cv.boards[o].title)));sel.value=cmp.board;
  sel.onchange=()=>{cmp.board=sel.value;cmp.base=null;loadCmp()};
  const changed=hist.filter(e=>e.rev>cmp.base);
  const appr=Object.entries(cv.boards).filter(([,x])=>x.approved===x.rev).length,total=Object.keys(cv.boards).length;
  const pending=Object.values(cv.boards).find(x=>x.approved!==x.rev);
  const status=x=>x.approved===x.rev?h("span",{class:"ok"},"Approved"):x.approved?h("span",{class:"warn"},"Changed since rev "+x.approved):h("span",{class:"bad"},"Needs review");
  el.replaceChildren(
    h("div",{},h("div",{class:"row",style:"display:flex;gap:8px;align-items:center;margin-bottom:8px"},sel,h("b",{},b.title+" rev "+cmp.base+" → rev "+b.rev+" · "+changed.length+" change"+(changed.length===1?"":"s")),
        h("button",{onclick:()=>post("restore",{board:cmp.board,rev:cmp.base}).then(()=>toast("Restored as a new rev"))},"Restore rev "+cmp.base),
        h("button",{class:"primary",onclick:()=>post("approve",{board:cmp.board}).then(r=>toast("Approved "+b.title+" rev "+r.approved))},"Approve "+b.title)),
      h("div",{class:"pair"},h("div",{class:"col"},h("span",{},"rev "+cmp.base+" · before"),frame(B+"/c/"+C+"/history/"+name+".r"+cmp.base+".html")),
        h("div",{class:"col"},h("span",{},"rev "+b.rev+" · now"),frame(B+"/c/"+C+"/boards/"+name+".html?r="+b.rev+"."+bust)))),
    h("div",{class:"side"},h("b",{},"What changed"),...changed.map(e=>h("div",{},"rev "+e.rev+" · "+e.by+(e.why?" · "+e.why:""))),
      h("small",{},"Restoring never deletes: it adds a new rev with the old content."),
      h("b",{},"Revs"),...hist.map(e=>h("button",{class:e.rev===cmp.base?"on":"",onclick:()=>{cmp.base=e.rev;loadCmp()}},"rev "+e.rev+" "+e.by+(e.why?" · "+e.why:""))),
      h("b",{},"Approval "+appr+" of "+total+" boards"),
      ...Object.entries(cv.boards).map(([key,x])=>h("div",{class:"row"},h("span",{},x.title+" rev "+x.rev),status(x))),
      h("b",{},"Handoff to code"),h("small",{},"When every board is approved, pi gets a pack to build from: the boards at their approved revs, done notes, and the tokens used."),
      h("button",{class:pending?"":"primary",...(pending?{disabled:""}:{}),onclick:e=>{const t=e.currentTarget;t.disabled=true;post("build",{}).then(()=>toast("Design pack sent")).finally(()=>setTimeout(()=>t.disabled=false,3000))}},"Start build session"),
      h("small",{},pending?"Approve "+pending.title+" first.":"All boards are approved."),
      h("small",{},"Saved in the project: .tau/canvases/"+C+"/. Boards, notes and approvals are files, so they go into git.")))}

// compare with the app (board C12): pi runs design_compare; you decide each difference
let appSeq=0;
async function loadApp(){
  const seq=++appSeq;
  const all2=await fetch(B+"/c/"+C+"/compare.json").then(r=>r.json());
  if(seq!==appSeq||view2!=="app")return; // a newer load or another view took over
  if(!cmp.board||!cv.boards[cmp.board])cmp.board=cv.order[0];
  const el=$("#appcmp"),b=cv.boards[cmp.board],c=all2[cmp.board],k=.6;
  const tabs=h("div",{class:"tabs"},...cv.order.map(o=>h("button",{class:o===cmp.board?"on":"",onclick:()=>{cmp.board=o;loadApp()}},cv.boards[o].title+(all2[o]?" "+all2[o].differences.filter(d=>d.state==="open").length:""))));
  if(!c)return el.replaceChildren(h("div",{},tabs,h("p",{},"No comparison for "+b.title+" yet. pi checks a screen of the app against its approved board with design_compare."),
    h("button",{class:"primary",onclick:()=>{post("ask",{text:"Compare the app with the board “"+b.title+"” of canvas “"+C+"” using design_compare."});toast("Asked pi to compare")}},"Ask pi to compare")));
  const name=cmp.board.slice(7,-5);
  const boardBox=h("div",{});const f=h("iframe",{sandbox:"allow-scripts",src:B+"/c/"+C+"/history/"+name+".r"+c.rev+".html"});
  f.style.cssText="width:"+b.w+"px;height:"+b.h+"px;transform:scale("+k+");transform-origin:0 0;border:0;background:#fff;pointer-events:none";
  boardBox.style.cssText="width:"+b.w*k+"px;height:"+b.h*k+"px;overflow:hidden;border:1px solid var(--line)";boardBox.append(f);
  const shot=c.screenshot?h("img",{src:B+"/c/"+C+"/compare/"+c.screenshot,alt:"The app",style:"max-height:"+b.h*k+"px;max-width:"+b.w*k*1.2+"px"}):h("div",{class:"shot"},"No screenshot");
  if(!c.screenshot)shot.style.cssText="width:"+b.w*k+"px;height:"+b.h*k+"px";
  el.replaceChildren(h("div",{},tabs,h("div",{class:"pair"},h("div",{class:"col"},h("span",{},"Board · rev "+c.rev),boardBox),h("div",{class:"col"},h("span",{},"App"),shot))),
    h("div",{class:"side"},h("b",{},c.differences.length+" difference"+(c.differences.length===1?"":"s")),
      ...(c.differences.length?[]:[h("small",{},"Nothing differs in what pi compared.")]),
      ...c.differences.map((d,i)=>h("div",{class:"linkrow"},h("b",{},(i+1)+" · "+d.title),h("div",{},d.detail),
        d.state==="open"?h("div",{class:"row",style:"display:flex;gap:6px;margin-top:6px"},
          h("button",{class:"primary",onclick:()=>post("compare",{board:cmp.board,id:d.id,action:"fix"}).then(loadApp)},"Fix the code"),
          h("button",{onclick:()=>post("compare",{board:cmp.board,id:d.id,action:"wrong"}).then(loadApp)},"Board is wrong")):h("small",{},d.state==="fix"?"Sent to pi: fix the code":"Sent to pi: the board is wrong"))),
      h("small",{},".tau/canvases/"+C+"/compare/ · this computer only")))}

// point -> note box
addEventListener("message",e=>{
  const d=e.data;if(!d)return;
  if(d.type==="go"&&$("#pl")&&e.source===$("#pl").contentWindow){
    const href=String(d.href);
    if(/^[a-z][a-z0-9+.-]*:/i.test(href)||href[0]==="#")return; // outside links and anchors stay put
    const name=href.split("#")[0].split("?")[0].replace(".html","");
    const to=Object.keys(cv.boards).find(k=>k.slice(7,-5).toLowerCase()===name.toLowerCase());
    return to?playTo(to):toast("No board for “"+name+"”")}
  if(d.type==="key"&&$("#pl")&&e.source===$("#pl").contentWindow)return playKey(d.key);
  const key=[...frames.keys()].find(k=>frames.get(k).iframe.contentWindow===e.source);if(!key)return;
  if(d.type==="select"){selected={board:key,...d};return renderSide(curNotes)}
  if(d.type==="text"){selected={style:"",tag:"",canText:true,board:key,...d,full:d.text};return void post("edit",{board:key,tid:d.tid,text:d.text,tell}).then(r=>{lastMine={board:key,rev:r.rev}})}
  if(d.type!=="pick")return;
  const r=frames.get(key).iframe.getBoundingClientRect();
  pending={board:key,target:{tid:d.tid,text:d.text,box:d.box}};
  const pop=$("#pop");pop.replaceChildren();
  const ta=h("textarea",{placeholder:"What should change?"});
  const send=go=>()=>{if(!ta.value.trim())return;post("note",{note:{...pending,text:ta.value.trim()},send:go});pop.style.display="none"};
  ta.addEventListener("keydown",e=>{if(e.key!=="Enter"||e.shiftKey||e.isComposing)return;e.preventDefault();(e.metaKey||e.ctrlKey?send(false):send(true))()});
  pop.append(h("small",{},(cv.boards[key]?.title||key)+" › “"+d.text+"”"),ta,h("div",{},h("button",{onclick:send(false)},"Save note",h("kbd",{},"⌘↵")),h("button",{class:"primary",onclick:send(true)},"Send to pi",h("kbd",{},"↵")),h("button",{onclick:()=>pop.style.display="none"},"Cancel")));
  pop.style.display="flex";
  pop.style.left=Math.min(innerWidth-300,r.left+(d.box[0]+d.box[2])*view.k+8)+"px";
  pop.style.top=Math.min(innerHeight-200,Math.max(50,r.top+d.box[1]*view.k))+"px";ta.focus()
});

// pan and zoom
const stage=$("#stage");let drag=null;
stage.addEventListener("pointerdown",e=>{if(e.target.closest(".lbl"))return;if(e.target!==stage&&e.target!==$("#world")&&mode==="point")return;drag={x:e.clientX-view.x,y:e.clientY-view.y};stage.setPointerCapture(e.pointerId)});
stage.addEventListener("pointermove",e=>{if(!drag)return;view.x=e.clientX-drag.x;view.y=e.clientY-drag.y;applyView()});
stage.addEventListener("pointerup",()=>drag=null);
stage.addEventListener("wheel",e=>{e.preventDefault();
  if(e.ctrlKey||e.metaKey){const r=stage.getBoundingClientRect(),k=Math.min(3,Math.max(.1,view.k*Math.exp(-e.deltaY*.01))),px=e.clientX-r.left,py=e.clientY-r.top;
    view.x=px-(px-view.x)*k/view.k;view.y=py-(py-view.y)*k/view.k;view.k=k}
  else{view.x-=e.deltaX;view.y-=e.deltaY}applyView()},{passive:false});
addEventListener("keydown",e=>{if(/TEXTAREA|INPUT|SELECT/.test(e.target.tagName))return;
  if((e.metaKey||e.ctrlKey)&&e.key==="z"){e.preventDefault();return void undo()}
  if(e.key==="v")setMode("move");if(e.key==="p")setMode("point");if(e.key==="e")setMode("edit");if(mode==="play"&&e.key!=="Escape"){e.preventDefault();playKey(e.key)}if(e.key==="Escape"){$("#pop").style.display="none";showOnBoards(null);if(mode==="play")setMode("move")}});
$("#m-move").onclick=()=>setMode("move");$("#m-point").onclick=()=>setMode("point");$("#m-edit").onclick=()=>setMode("edit");$("#m-play").onclick=()=>setMode("play");$("#v-canvas").onclick=()=>setView("canvas");$("#v-compare").onclick=()=>setView("compare");$("#v-app").onclick=()=>setView("app");

// design system tab (read-only)
let ds=null,sel=null,tab="canvas";
const varsOf=i=>i.decls.map(d=>d[0]);
const showOnBoards=vars=>{for(const f of frames.values())f.iframe.contentWindow&&f.iframe.contentWindow.postMessage({type:"show",vars},"*")};
async function loadDs(){ds=await(await fetch(B+"/c/"+C+"/ds.json")).json();renderDs()}
function setTab(t){tab=t;document.body.dataset.tab=t;renderTabs();if(t==="ds"){showOnBoards(null);loadDs()}else if(cv)render()}
function renderDs(){
  const el=$("#ds");el.replaceChildren();
  el.append(h("div",{class:"dstop"},h("b",{},ds.name?ds.name+" · v"+ds.version:"No design system yet"),
    h("button",{onclick:()=>post("ds/update",{})},ds.name?"Update from code":"Create from code")));
  if(ds.proposal){
    const ch=ds.proposal.changes;
    el.append(h("div",{class:"prop"},h("b",{},"pi proposes "+ch.length+" change"+(ch.length===1?"":"s")),
      ...ch.map(c=>h("div",{},c.name+": "+(c.before??"(new)")+" → "+(c.after??"(removed)"))),
      h("div",{class:"row"},h("button",{class:"primary",onclick:()=>post("ds/accept",{}).then(loadDs)},"Accept"),h("button",{onclick:()=>post("ds/discard",{}).then(loadDs)},"Discard"))))}
  for(const[g,title]of[["color","Colors"],["type","Type"],["spacing","Spacing"],["radius","Radius"]]){
    const items=ds.items.filter(i=>i.group===g);if(!items.length)continue;
    const grid=h("div",{class:"tokens"});
    for(const i of items){
      const sw=h("span",{class:"sw"});
      if(g==="color")sw.style.background=i.value;
      if(g==="radius")sw.style.borderRadius=i.value;
      if(g==="spacing"){sw.style.width=i.value;sw.style.minWidth="4px"}
      const key=g+"/"+i.name;
      grid.append(h("button",{class:"tok"+(sel===key?" sel":""),onclick:()=>{sel=key;renderDs()}},sw,h("span",{},i.name,h("small",{},i.value))))}
    el.append(h("h3",{},title),grid)}
  const it=ds.items.find(i=>i.group+"/"+i.name===sel);
  if(it){
    const use=it.used.length?"Used "+it.used.reduce((n,u)=>n+u.count,0)+"× on "+it.used.map(u=>u.board+" ("+u.count+")").join(", "):"Not used on any board";
    el.append(h("div",{class:"detail"},h("b",{},varsOf(it).map(v=>"--"+v).join(", ")),h("div",{},it.value),it.usage?h("small",{},it.usage):"",h("div",{},use),
      h("div",{class:"row"},
        h("button",{onclick:()=>{try{navigator.clipboard.writeText("var(--"+varsOf(it)[0]+")")}catch(e){}}},"Copy name"),
        h("button",{onclick:()=>{setTab("canvas");showOnBoards(varsOf(it))}},"Show on boards"))))}
}

// live updates
const es=new EventSource(B+"/events");
es.onmessage=async e=>{const d=JSON.parse(e.data);if(d.type==="tokens-changed")bust++;await load();if(tab==="ds")loadDs();if(view2==="compare")loadCmp();if(view2==="app")loadApp()};
applyView();load().then(()=>{if(new URLSearchParams(location.search).get("tab")==="ds")setTab("ds")});
</script></body></html>`;
