// Browser-side code, kept as strings so the extension is plain TS files with no build step.

/** Injected into every board. Point mode outlines the element under the mouse; a click reports it to the viewer. */
export const POINT_SCRIPT = `(()=>{
let mode="move";
const box=document.createElement("div");
box.style.cssText="position:fixed;pointer-events:none;border:2px solid #4e6f94;background:rgba(78,111,148,.12);z-index:2147483647;display:none";
document.documentElement.append(box);
const tgt=e=>e.target.closest&&e.target.closest("[data-tid]");
addEventListener("message",e=>{if(e.data&&e.data.type==="mode"){mode=e.data.mode;if(mode!=="point")box.style.display="none"}});
addEventListener("mouseover",e=>{if(mode!=="point")return;const t=tgt(e);if(!t)return;const r=t.getBoundingClientRect();
Object.assign(box.style,{display:"block",left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"})},true);
addEventListener("click",e=>{if(mode!=="point")return;e.preventDefault();e.stopPropagation();const t=tgt(e);if(!t)return;
const r=t.getBoundingClientRect();
parent.postMessage({type:"pick",tid:t.dataset.tid,text:(t.innerText||t.getAttribute("aria-label")||t.tagName).trim().slice(0,60),
box:[r.left,r.top,r.width,r.height].map(Math.round)},"*")},true);
addEventListener("submit",e=>e.preventDefault(),true);
})();`;

/** The canvas viewer. __BASE__ and __CANVAS__ are replaced by the server. */
export const VIEWER = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas</title>
<style>
:root{--bg:#f4f4f2;--fg:#1c1c1a;--mut:#75756f;--card:#fff;--line:#d9d9d4;--acc:#4e6f94}
@media(prefers-color-scheme:dark){:root{--bg:#161615;--fg:#eeeeea;--mut:#9a9a93;--card:#232322;--line:#3a3a37;--acc:#7f9fc4}}
*{box-sizing:border-box}
body{margin:0;height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,sans-serif;overflow:hidden}
header{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--card)}
header b{margin-right:auto}
button{font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
button.on,button.primary{background:var(--acc);border-color:var(--acc);color:#fff}
main{flex:1;display:flex;min-height:0}
#stage{flex:1;position:relative;overflow:hidden;touch-action:none}
#world{position:absolute;left:0;top:0;transform-origin:0 0}
.board{position:absolute}
.board .lbl{position:absolute;top:-20px;left:0;color:var(--mut);white-space:nowrap}
.board iframe{border:1px solid var(--line);background:#fff;display:block}
body.move iframe{pointer-events:none}
body.point #stage{cursor:crosshair}
.pin{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--acc);color:#fff;font-size:11px;display:grid;place-items:center}
.pin.done{opacity:.4}
aside{width:280px;border-left:1px solid var(--line);background:var(--card);overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.note{border:1px solid var(--line);border-radius:8px;padding:8px}
.note.done{opacity:.55}
.note small{color:var(--mut);display:block}
#pop{position:fixed;z-index:10;width:280px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;box-shadow:0 8px 24px #0003;display:none;flex-direction:column;gap:8px}
#pop textarea{width:100%;height:70px;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px}
#pop div{display:flex;gap:6px}
</style></head>
<body class="move">
<header><b id="title">Canvas</b>
<button id="m-move" class="on">Move <kbd>V</kbd></button><button id="m-point">Point <kbd>P</kbd></button>
<span id="zoom"></span></header>
<main><div id="stage"><div id="world"></div></div><aside id="side"></aside></main>
<div id="pop"></div>
<script>
const B="__BASE__",C="__CANVAS__";
let cv,mode="move",view={x:40,y:50,k:.6},bust=0,pending=null;
const frames=new Map();
const $=s=>document.querySelector(s);
const h=(t,p={},...kids)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(p)){if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(k==="class")e.className=v;else e.setAttribute(k,v)}e.append(...kids);return e};
const post=(path,body)=>fetch(B+"/api/"+path,{method:"POST",body:JSON.stringify({canvas:C,...body})}).then(r=>r.json());

async function load(){cv=await(await fetch(B+"/c/"+C+"/canvas.json")).json();render()}
function applyView(){$("#world").style.transform="translate("+view.x+"px,"+view.y+"px) scale("+view.k+")";$("#zoom").textContent=Math.round(view.k*100)+"%"}
function setMode(m){mode=m;document.body.className=m;$("#m-move").classList.toggle("on",m==="move");$("#m-point").classList.toggle("on",m==="point");
for(const f of frames.values())f.iframe.contentWindow&&f.iframe.contentWindow.postMessage({type:"mode",mode:m},"*")}

function render(){
  $("#title").textContent=cv.title;
  const world=$("#world");
  for(const[key,f]of frames)if(!cv.boards[key]){f.wrap.remove();frames.delete(key)}
  for(const[key,b]of Object.entries(cv.boards)){
    let f=frames.get(key);
    if(!f){
      const iframe=h("iframe",{sandbox:"allow-scripts"});
      iframe.addEventListener("load",()=>iframe.contentWindow.postMessage({type:"mode",mode},"*"));
      const lbl=h("div",{class:"lbl"});
      const wrap=h("div",{class:"board"},lbl,iframe);
      world.append(wrap);f={wrap,iframe,lbl,src:""};frames.set(key,f)
    }
    f.wrap.style.cssText="left:"+b.x+"px;top:"+b.y+"px";
    f.iframe.style.cssText="width:"+b.w+"px;height:"+b.h+"px";
    f.lbl.textContent=b.title+" · rev "+b.rev+" · by "+b.by;
    const src=B+"/c/"+C+"/"+key+"?r="+b.rev+"."+bust;
    if(f.src!==src){f.src=src;f.iframe.src=src}
  }
  world.querySelectorAll(".pin").forEach(p=>p.remove());
  const notes=Object.entries(cv.notes);
  notes.forEach(([id,n],i)=>{const b=cv.boards[n.board];if(!b)return;
    const pin=h("div",{class:"pin "+n.state,title:n.text},String(i+1));
    pin.style.cssText="left:"+(b.x+n.target.box[0])+"px;top:"+(b.y+n.target.box[1])+"px";world.append(pin)});
  renderSide(notes)
}
function renderSide(notes){
  const side=$("#side");side.replaceChildren();
  const open=notes.filter(([,n])=>n.state==="open");
  if(open.length)side.append(h("button",{class:"primary",onclick:()=>post("send",{ids:open.map(([id])=>id)})},"Send "+open.length+" saved note"+(open.length>1?"s":"")+" to pi"));
  if(!notes.length)side.append(h("small",{},"No notes. Press P, then click an element."));
  notes.forEach(([id,n],i)=>{
    const el=h("div",{class:"note "+(n.state==="done"?"done":"")},
      h("small",{},(i+1)+" · "+(cv.boards[n.board]?.title||n.board)+" · "+n.state),h("div",{},n.text),h("small",{},"“"+n.target.text+"”"));
    if(n.state==="done")el.append(h("button",{onclick:()=>post("state",{ids:[id],state:"open"})},"Reopen"));
    side.append(el)})
}

// point -> note box
addEventListener("message",e=>{
  const d=e.data;if(!d||d.type!=="pick")return;
  const key=[...frames.keys()].find(k=>frames.get(k).iframe.contentWindow===e.source);if(!key)return;
  const r=frames.get(key).iframe.getBoundingClientRect();
  pending={board:key,target:{tid:d.tid,text:d.text,box:d.box}};
  const pop=$("#pop");pop.replaceChildren();
  const ta=h("textarea",{placeholder:"What should change?"});
  const send=go=>()=>{if(!ta.value.trim())return;post("note",{note:{...pending,text:ta.value.trim()},send:go});pop.style.display="none"};
  pop.append(h("small",{},"“"+d.text+"”"),ta,h("div",{},h("button",{class:"primary",onclick:send(true)},"Send now"),h("button",{onclick:send(false)},"Save note"),h("button",{onclick:()=>pop.style.display="none"},"Cancel")));
  pop.style.display="flex";
  pop.style.left=Math.min(innerWidth-300,r.left+(d.box[0]+d.box[2])*view.k+8)+"px";
  pop.style.top=Math.min(innerHeight-200,Math.max(50,r.top+d.box[1]*view.k))+"px";ta.focus()
});

// pan and zoom
const stage=$("#stage");let drag=null;
stage.addEventListener("pointerdown",e=>{if(e.target!==stage&&e.target!==$("#world")&&mode==="point")return;drag={x:e.clientX-view.x,y:e.clientY-view.y};stage.setPointerCapture(e.pointerId)});
stage.addEventListener("pointermove",e=>{if(!drag)return;view.x=e.clientX-drag.x;view.y=e.clientY-drag.y;applyView()});
stage.addEventListener("pointerup",()=>drag=null);
stage.addEventListener("wheel",e=>{e.preventDefault();
  if(e.ctrlKey||e.metaKey){const r=stage.getBoundingClientRect(),k=Math.min(3,Math.max(.1,view.k*Math.exp(-e.deltaY*.01))),px=e.clientX-r.left,py=e.clientY-r.top;
    view.x=px-(px-view.x)*k/view.k;view.y=py-(py-view.y)*k/view.k;view.k=k}
  else{view.x-=e.deltaX;view.y-=e.deltaY}applyView()},{passive:false});
addEventListener("keydown",e=>{if(/TEXTAREA|INPUT/.test(e.target.tagName))return;
  if(e.key==="v")setMode("move");if(e.key==="p")setMode("point");if(e.key==="Escape")$("#pop").style.display="none"});
$("#m-move").onclick=()=>setMode("move");$("#m-point").onclick=()=>setMode("point");

// live updates
const es=new EventSource(B+"/events");
es.onmessage=e=>{const d=JSON.parse(e.data);if(d.canvas&&d.canvas!==C)return;if(d.type==="tokens-changed")bust++;load()};
applyView();load();
</script></body></html>`;
