(() => {
  "use strict";
  const chapters = window.PETER_CHAPTERS;
  const pages = window.PETER_PAGES;
  const stickers = window.PETER_STICKERS;
  if (!Array.isArray(pages) || pages.length !== 24) throw new Error("彼得潘書頁資料不完整");
  const byId = Object.fromEntries(stickers.map(s => [s.id, s]));
  const STORAGE_KEY = "storybook-peterpan-original-v1";
  const $ = id => document.getElementById(id);
  const empty = () => ({page:0, placements:{}, finished:{}, selected:null});
  function readState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && typeof raw === "object") return {
        page: Math.min(23, Math.max(0, Number(raw.page) || 0)),
        placements: raw.placements && typeof raw.placements === "object" ? raw.placements : {},
        finished: raw.finished && typeof raw.finished === "object" ? raw.finished : {},
        selected:null
      };
    } catch {}
    return empty();
  }
  let state = readState();
  const chapterNames = ["一","二","三","四","五","六"];
  // Anchor: [left %, bottom %, width %]. Stored relative to the source 4:3
  // picture, so characters and props always scale with their illustration.
  // Anchor slots are independent of sticker type: either can hold ANY sticker.
  const ANCHORS = [
    [[23,9,21],[59,17,15]],[[28,9,19],[58,20,17]],
    [[25,10,21],[45,12,11]],[[28,43,13],[56,46,12]],
    [[25,36,14],[57,55,11]],[[29,10,20],[61,16,14]],
    [[26,11,19],[44,24,9]],[[23,10,21],[58,12,21]],
    [[26,10,21],[57,15,14]],[[28,10,23],[59,18,12]],
    [[28,14,20],[55,18,13]],[[27,31,15],[55,16,21]],
    [[25,9,24],[58,17,12]],[[27,10,21],[61,23,16]],
    [[26,10,21],[59,15,14]],[[27,12,22],[59,19,10]],
    [[27,46,12],[57,10,20]],[[27,13,20],[58,26,12]],
    [[26,10,22],[58,17,12]],[[24,10,24],[58,10,23]],
    [[27,11,22],[59,17,19]],[[26,10,22],[58,25,19]],
    [[25,11,24],[57,12,21]],[[26,44,13],[58,12,19]]
  ];
  function save() {
    try {localStorage.setItem(STORAGE_KEY, JSON.stringify({...state, selected:null}));} catch {}
  }
  const placement = (page,slot) => state.placements[page+"-"+slot] || null;
  const isCorrect = page => pages[page].answer.every((id, slot) => placement(page,slot) === id);
  const solvedCount = () => pages.reduce((count,_,i)=>count+(state.finished[i] && isCorrect(i) ? 1 : 0),0);
  function setPage(index) {
    state.page = Math.max(0,Math.min(23,index));
    state.selected = null;
    save();
    render();
    $("reader").scrollIntoView({block:"start",behavior:"instant"});
  }
  function put(slot,id) {
    if (!(id in byId) || (slot !== 0 && slot !== 1)) return;
    state.placements[state.page+"-"+slot] = id;
    delete state.finished[state.page];
    state.selected = null;
    save();
    render();
  }
  function take(slot) {
    delete state.placements[state.page+"-"+slot];
    delete state.finished[state.page];
    state.selected = null;
    save();
    render();
  }
  function stagePosition(page,slot,id) {
    const [left,bottom,width] = ANCHORS[page][slot];
    const item = byId[id];
    const kind = item?.kind || (slot === 0 ? "character" : "prop");
    const aspect = kind === "character" ? .75 : 1;
    const maxHeight = 65;
    // Keep source character whole: scene W/H=4:3, avatar H/W=4:3.
    const height = Math.min(maxHeight, width*4/(3*aspect));
    return {left,bottom,width,height};
  }
  function inlinePos({left,bottom,width,height}) {
    return `left:${left}%;bottom:${bottom}%;width:${width}%;height:${height}%;`;
  }
  function nearestSlot(x,y) {
    const rect=$("stage").getBoundingClientRect();
    const xp=(x-rect.left)/rect.width*100;
    const yp=(rect.bottom-y)/rect.height*100;
    const distances = [0,1].map(slot=>{
      const pos=stagePosition(state.page,slot,placement(state.page,slot));
      return (xp-pos.left-pos.width/2)**2+(yp-pos.bottom-pos.height/2)**2;
    });
    return distances[0] <= distances[1] ? 0 : 1;
  }
  function renderStory() {
    const data = pages[state.page];
    $("chapterLabel").textContent = "第"+chapterNames[data.chapter-1]+"章 · "+chapters[data.chapter-1];
    $("pageChapter").textContent = "CHAPTER "+String(data.chapter).padStart(2,"0")+" — "+chapters[data.chapter-1];
    $("pageTitle").textContent = data.title;
    $("readingProgress").textContent = "第 "+data.page+" / 24 頁";
    const body = $("storyText");
    body.replaceChildren(...data.text.map(text=>{
      const el=document.createElement("p");
      el.textContent=text;
      return el;
    }));
    $("pageClue").textContent = data.clue;
    const actor = byId[placement(state.page,0)]?.name;
    const object = byId[placement(state.page,1)]?.name;
    $("storyNote").textContent =
      isCorrect(state.page) ? "✦ 這一頁的故事已拼合。光影回到了它應在的位置。" :
      (actor || object) ? `目前畫面裡，${actor||"一個模糊的身影"}遇見了${object||"一件未知的事物"}。再看看線索，故事是否說得通？` :
      "故事還缺少兩個關鍵角色或物品。";
    $("sceneImage").src = data.scene;
    $("sceneImage").alt = "第"+data.page+"頁："+data.title+"的水彩場景";
  }
  function renderStage() {
    const wrap=$("stageActors");
    wrap.replaceChildren();
    for(let slot=0;slot<2;slot++){
      const id=placement(state.page,slot);
      const item=byId[id];
      const rect=stagePosition(state.page,slot,id);
      const button=document.createElement("button");
      button.type="button";
      button.dataset.slot=String(slot);
      button.style.cssText=inlinePos(rect);
      if(item) {
        button.className="stage-placed";
        button.title="點擊取下或替換："+item.name;
        button.setAttribute("aria-label","放置區"+(slot+1)+"："+item.name+"，點擊取下");
        const img=document.createElement("img");
        img.src=item.src;img.alt=item.name;
        img.onerror=()=>{img.hidden=true;button.textContent="✦ "+item.name;};
        button.append(img);
        const lab=document.createElement("small");lab.textContent=item.name;button.append(lab);
      } else {
        button.className="stage-target";
        button.setAttribute("aria-label","放置區"+(slot+1)+"，等待貼紙");
        const lab=document.createElement("span");lab.textContent="＋ 放入貼紙";button.append(lab);
      }
      button.addEventListener("click",e=>{
        e.stopPropagation();
        if(state.selected) put(slot,state.selected);
        else if(item) take(slot);
      });
      button.addEventListener("dragover",e=>{e.preventDefault();e.stopPropagation()});
      button.addEventListener("drop",e=>{
        e.preventDefault();e.stopPropagation();put(slot,e.dataTransfer.getData("text/plain"));
      });
      wrap.append(button);
    }
    $("stageHelp").hidden=!!(placement(state.page,0)||placement(state.page,1));
  }
  function chapterStickers() {
    const page=pages[state.page];
    const allIds=pages.filter(p=>p.chapter===page.chapter).flatMap(p=>p.answer);
    // Keep the complete relevant chapter collection, plus some alternate
    // choices for meaningful trial-and-error without exposing all 31 at once.
    const distractors = ["peter","wendy","tinker","hook","star","storybook"];
    const ids=[...new Set([...page.answer,...allIds,...distractors])];
    return ids.map(id=>byId[id]).filter(Boolean);
  }
  function renderTray() {
    const items=chapterStickers();
    $("stickerCount").textContent=items.length+" 枚";
    const tray=$("stickerTray");tray.replaceChildren();
    for (const item of items) {
      const button=document.createElement("button");
      button.type="button";button.className="sticker"+(state.selected===item.id?" selected":"");
      button.dataset.id=item.id;button.draggable=true;
      button.setAttribute("aria-pressed",state.selected===item.id);
      button.title="選取 "+item.name+"，再點選場景";
      const img=document.createElement("img");img.src=item.src;img.alt="";img.loading="lazy";
      img.onerror=()=>{img.hidden=true;button.textContent="✧ "+item.name};
      const label=document.createElement("b");label.textContent=item.name;
      button.append(img,label);
      button.addEventListener("click",()=>{
        state.selected=state.selected===item.id?null:item.id;render();
      });
      button.addEventListener("dragstart",e=>{
        e.dataTransfer.setData("text/plain",item.id);e.dataTransfer.effectAllowed="copy";
      });
      // Touch dragging: tap remains normal; release into the scene places art.
      let pointer=null;
      button.addEventListener("pointerdown",e=>{
        if(e.pointerType==="mouse")return;
        pointer={x:e.clientX,y:e.clientY};
      });
      button.addEventListener("pointerup",e=>{
        if(!pointer)return;
        const moved=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>15;
        pointer=null;
        if(moved&&$("stage").contains(document.elementFromPoint(e.clientX,e.clientY))){
          put(nearestSlot(e.clientX,e.clientY),item.id);
        }
      });
      tray.append(button);
    }
  }
  function renderChapters() {
    const nav=$("chapterNav");nav.replaceChildren();
    for(let i=0;i<6;i++){
      const b=document.createElement("button");b.type="button";
      b.className=i===Math.floor(state.page/4)?"active":"";
      b.textContent="第"+chapterNames[i]+"章｜"+chapters[i];
      b.setAttribute("aria-current",i===Math.floor(state.page/4)?"step":"false");
      b.addEventListener("click",()=>setPage(i*4));
      nav.append(b);
    }
  }
  function render() {
    renderStory();renderStage();renderTray();renderChapters();
    const count=solvedCount();
    $("completeCount").textContent=count+" / 24";
    $("meterFill").style.width=(count/24*100)+"%";
    $("prevPage").disabled=state.page===0;
    $("nextPage").disabled=state.page===23;
    $("feedback").textContent=state.finished[state.page]&&isCorrect(state.page) ?
      (count===24?"✦ 恭喜完成 24 頁故事！童年的光將永遠留在記憶裡。":"✦ 答案正確！這一頁的故事已完成，可以繼續冒險。") : "";
    $("feedback").className="feedback"+(state.finished[state.page]?" success":"");
    save();
  }
  $("prevPage").addEventListener("click",()=>setPage(state.page-1));
  $("nextPage").addEventListener("click",()=>setPage(state.page+1));
  $("checkPage").addEventListener("click",()=>{
    if(!isCorrect(state.page)) {
      $("feedback").textContent="故事似乎還沒拼對。請對照線索，再試試不同的人物或物件。";
      $("feedback").className="feedback";
      return;
    }
    state.finished[state.page]=true;save();render();
  });
  $("resetPage").addEventListener("click",()=>{
    if(!confirm("確定要清除這一頁的兩個貼紙與完成標記嗎？"))return;
    take(0);take(1);
  });
  $("resetBook").addEventListener("click",()=>{
    if(!confirm("確定要清除彼得潘全部 24 頁的進度嗎？此操作無法復原。"))return;
    state=empty();save();render();
  });
  const stage=$("stage");
  stage.addEventListener("click",e=>{
    if(!state.selected)return;
    const target=e.target.closest("[data-slot]");
    const slot=target?Number(target.dataset.slot):nearestSlot(e.clientX,e.clientY);
    put(slot,state.selected);
  });
  stage.addEventListener("keydown",e=>{
    if(e.key==="Enter" && state.selected){e.preventDefault();put(placement(state.page,0)?1:0,state.selected);}
  });
  stage.addEventListener("dragover",e=>e.preventDefault());
  stage.addEventListener("drop",e=>{
    e.preventDefault();
    const id=e.dataTransfer.getData("text/plain");
    if(id&&byId[id]) put(nearestSlot(e.clientX,e.clientY),id);
  });
  // Keep sticker selection immediately under the illustration on portrait.
  const media=matchMedia("(max-width:900px)");
  const toolbox=document.querySelector(".toolbox");
  const workspace=document.querySelector(".workspace");
  function layout(){
    if(media.matches) document.querySelector(".stage-shell").after(toolbox);
    else workspace.append(toolbox);
  }
  media.addEventListener("change",layout);layout();render();
})();
