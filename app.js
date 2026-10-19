const STICKERS=[{id:"fox",name:"小狐狸",emoji:"🦊"},{id:"girl",name:"小女孩",emoji:"👧"},{id:"owl",name:"貓頭鷹",emoji:"🦉"},{id:"key",name:"金鑰匙",emoji:"🗝️"},{id:"lantern",name:"提燈",emoji:"🏮"},{id:"book",name:"故事書",emoji:"📖"}];
const PAGES=[
{title:"森林的訪客",kicker:"01 — 相遇",scene:"🌲",hint:"線索：她帶著光，來尋找失落的秘密。",answer:["girl","lantern"],labels:["誰來到森林？","帶著什麼？"],story:v=>`在月光灑落的夜裡，${v[0]||"某位旅人"}悄悄走進森林，手中帶著${v[1]||"一件神祕的東西"}，尋找被遺忘的約定。`},
{title:"樹洞裡的秘密",kicker:"02 — 線索",scene:"🦉",hint:"線索：夜晚的守護者，替她找出開啟秘密的物件。",answer:["owl","key"],labels:["誰守護著樹洞？","交出了什麼？"],story:v=>`古老的樹洞旁，${v[0]||"一個影子"}靜靜等候。牠把${v[1]||"一樣寶物"}交給旅人，請她記住回家的路。`},
{title:"月光下的結局",kicker:"03 — 歸途",scene:"📖",hint:"線索：最初的旅人，終於找到記載約定的東西。",answer:["girl","book"],labels:["誰完成了旅程？","找到什麼？"],story:v=>`清晨到來前，${v[0]||"那位旅人"}打開${v[1]||"最後的祕密"}，終於明白：真正的寶藏，是有人願意守護的故事。`},
];
const KEY="moonforest-story-v1";
const $=id=>document.getElementById(id);
let state={page:0,placements:{},selected:null,checked:{}};
try{const old=JSON.parse(localStorage.getItem(KEY));if(old&&typeof old==="object"){state={...state,...old,page:Math.max(0,Math.min(2,Number(old.page)||0)),selected:null};}}catch{}
function saved(){try{localStorage.setItem(KEY,JSON.stringify({...state,selected:null}));}catch{}}
const entry=(p,s)=>state.placements[p+"-"+s]||null;
const complete=p=>PAGES[p].answer.every((a,i)=>entry(p,i)===a);
const count=()=>PAGES.filter((_,i)=>complete(i)).length;
function put(slot,id){if(!STICKERS.some(s=>s.id===id))return;state.placements[state.page+"-"+slot]=id;delete state.checked[state.page];state.selected=null;saved();render();}
function render(){
const p=state.page, data=PAGES[p],values=[entry(p,0),entry(p,1)].map(v=>STICKERS.find(s=>s.id===v)?.name);
$("chapter").textContent="CHAPTER 0"+(p+1);$("pagecount").textContent=(p+1)+" / 3";$("kicker").textContent=data.kicker;$("page-title").textContent=data.title;$("story").textContent=data.story(values);
$("hint").textContent=data.hint;
const sceneItems=[entry(p,0),entry(p,1)].map(id=>STICKERS.find(s=>s.id===id));
$("sceneEmoji").innerHTML=sceneItems.some(Boolean)
  ? sceneItems.map((item,i)=>item
      ? `<span class="forest-actor forest-actor-${i}" title="${item.name}"><span class="actor-art">${item.emoji}</span><span class="actor-name">${item.name}</span></span>`
      : `<span class="forest-actor forest-empty"><span class="actor-art">＋</span><span class="actor-name">等待貼紙</span></span>`).join("")
  : '<span class="forest-instruction">把貼紙放進故事，角色就會走進森林</span>';
$("sceneEmoji").setAttribute("aria-label",sceneItems.filter(Boolean).map(s=>s.name).join("、")||"尚未放置貼紙");
$("dots").innerHTML=PAGES.map((_,i)=>'<span class="dot '+(i===p?'active':'')+'"></span>').join("");
$("slots").innerHTML=data.labels.map((label,i)=>{const selected=STICKERS.find(s=>s.id===entry(p,i));return `<button class="slot ${selected?'filled':''}" data-slot="${i}" aria-label="${label}，${selected?selected.name:'未放置'}"><span class="symbol">${selected?selected.emoji:'＋'}</span><small>${selected?selected.name:label}</small></button>`;}).join("");
$("stickers").innerHTML=STICKERS.map(s=>`<button class="sticker ${state.selected===s.id?'selected':''}" draggable="true" data-id="${s.id}" aria-pressed="${state.selected===s.id}"><span class="symbol">${s.emoji}</span><span>${s.name}</span></button>`).join("");
$("prev").disabled=p===0;$("next").disabled=p===2;
$("progressText").textContent=count()+" / 3";$("progressBar").style.width=(count()/3*100)+"%";
const result=$("result");result.className="result";
if(state.checked[p]){const good=complete(p);result.textContent=good?(count()===3?"✦ 三頁故事全部完成！月光森林的秘密已揭曉。":"✦ 這一頁的故事完整了！可以繼續翻頁。"):"故事還有些不對勁，根據提示重新安排貼紙吧。";if(good)result.classList.add("good");}
else result.textContent="";
document.querySelectorAll(".slot").forEach(el=>{
 const i=Number(el.dataset.slot);
 el.addEventListener("click",()=>{if(state.selected)put(i,state.selected);else if(entry(p,i)){delete state.placements[p+"-"+i];delete state.checked[p];saved();render();}});
 el.addEventListener("dragover",e=>{e.preventDefault();el.classList.add("dragover")});el.addEventListener("dragleave",()=>el.classList.remove("dragover"));
 el.addEventListener("drop",e=>{e.preventDefault();put(i,e.dataTransfer.getData("text/plain"))});
});
document.querySelectorAll(".sticker").forEach(el=>{
 el.addEventListener("click",()=>{state.selected=state.selected===el.dataset.id?null:el.dataset.id;render()});
 el.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",el.dataset.id);e.dataTransfer.effectAllowed="copy"});
 let x,y,moved=false;
 el.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")return;x=e.clientX;y=e.clientY;moved=false});
 el.addEventListener("pointermove",e=>{if(x!==undefined&&Math.hypot(e.clientX-x,e.clientY-y)>12)moved=true});
 el.addEventListener("pointerup",e=>{if(x===undefined)return;if(moved){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest(".slot");if(target)put(Number(target.dataset.slot),el.dataset.id);}x=undefined;y=undefined;});
});
}
$("prev").addEventListener("click",()=>{state.page--;state.selected=null;saved();render()});
$("next").addEventListener("click",()=>{state.page++;state.selected=null;saved();render()});
$("check").addEventListener("click",()=>{state.checked[state.page]=true;saved();render()});
$("reset").addEventListener("click",()=>{if(!confirm("確定要清除所有頁面的貼紙並重新開始嗎？"))return;state={page:0,placements:{},selected:null,checked:{}};saved();render()});
render();
