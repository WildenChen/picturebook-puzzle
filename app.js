// 貼紙定義與素材對應
const STICKERS = [
  { id: "girl", name: "小女孩", kind: "character", src: "assets/characters/girl.svg", emoji: "👧" },
  { id: "fox", name: "小狐狸", kind: "character", src: "assets/characters/fox.svg", emoji: "🦊" },
  { id: "owl", name: "貓頭鷹", kind: "character", src: "assets/characters/owl.svg", emoji: "🦉" },
  { id: "lantern", name: "提燈", kind: "prop", src: "assets/props/lantern.svg", emoji: "🏮" },
  { id: "key", name: "金鑰匙", kind: "prop", src: "assets/props/key.svg", emoji: "🗝️" },
  { id: "book", name: "故事書", kind: "prop", src: "assets/props/book.svg", emoji: "📖" }
];

// 每頁的場景設定與插畫層級定位
const PAGES = [
  {
    title: "森林的訪客",
    kicker: "01 — 相遇",
    hint: "線索：她帶著光，來尋找失落的秘密。",
    answer: ["girl", "lantern"],
    labels: ["誰來到森林？", "帶著什麼？"],
    bg: "assets/scene/bg-page-1.svg",
    fg: "assets/scene/fg-page-1.svg",
    // 預設與錯誤貼紙的位置（百分比 layout，適應手機與桌面）
    slotsLayout: [
      { defaultClass: "pos-page1-actor", defaultLabel: "造訪森林的旅人" },
      { defaultClass: "pos-page1-prop", defaultLabel: "攜帶的物件" }
    ],
    // 針對特定貼紙做更具故事氛圍的角色專屬微調
    customPlacement: {
      "0-girl": { className: "actor-girl-p1" },
      "0-fox": { className: "actor-fox-p1" },
      "0-owl": { className: "actor-owl-p1" },
      "1-lantern": { className: "prop-lantern-p1" },
      "1-key": { className: "prop-key-p1" },
      "1-book": { className: "prop-book-p1" }
    },
    story: v => `在月光灑落的夜裡，${v[0] || "某位旅人"}悄悄走進森林，手中帶著${v[1] || "一件神祕的東西"}，尋找被遺忘的約定。`
  },
  {
    title: "樹洞裡的秘密",
    kicker: "02 — 線索",
    hint: "線索：夜晚的守護者，替她找出開啟秘密的物件。",
    answer: ["owl", "key"],
    labels: ["誰守護著樹洞？", "交出了什麼？"],
    bg: "assets/scene/bg-page-2.svg",
    fg: "assets/scene/fg-page-2.svg",
    slotsLayout: [
      { defaultClass: "pos-page2-actor", defaultLabel: "守護樹洞的身影" },
      { defaultClass: "pos-page2-prop", defaultLabel: "樹洞中的寶物" }
    ],
    customPlacement: {
      "0-owl": { className: "actor-owl-p2" }, // 棲息於樹枝高處
      "0-fox": { className: "actor-fox-p2" }, // 坐在樹根旁
      "0-girl": { className: "actor-girl-p2" }, // 站在樹洞前探尋
      "1-key": { className: "prop-key-p2" }, // 在樹洞中散發金光
      "1-lantern": { className: "prop-lantern-p2" }, // 掛在樹洞旁
      "1-book": { className: "prop-book-p2" } // 倚在樹根處
    },
    story: v => `古老的樹洞旁，${v[0] || "一個影子"}靜靜等候。牠把${v[1] || "一樣寶物"}交給旅人，請她記住回家的路。`
  },
  {
    title: "月光下的結局",
    kicker: "03 — 歸途",
    hint: "線索：最初的旅人，終於找到記載約定的東西。",
    answer: ["girl", "book"],
    labels: ["誰完成了旅程？", "找到什麼？"],
    bg: "assets/scene/bg-page-3.svg",
    fg: "assets/scene/fg-page-3.svg",
    slotsLayout: [
      { defaultClass: "pos-page3-actor", defaultLabel: "迎來結局的旅人" },
      { defaultClass: "pos-page3-prop", defaultLabel: "祭壇上的秘密" }
    ],
    customPlacement: {
      "0-girl": { className: "actor-girl-p3" }, // 來到石台前
      "0-fox": { className: "actor-fox-p3" },
      "0-owl": { className: "actor-owl-p3" },
      "1-book": { className: "prop-book-p3" }, // 翻開在月光石台中央
      "1-lantern": { className: "prop-lantern-p3" },
      "1-key": { className: "prop-key-p3" }
    },
    story: v => `清晨到來前，${v[0] || "那位旅人"}打開${v[1] || "最後的祕密"}，終於明白：真正的寶藏，是有人願意守護的故事。`
  }
];

const KEY = "moonforest-story-v1";
const $ = id => document.getElementById(id);

let state = {
  page: 0,
  placements: {},
  selected: null,
  checked: {}
};

try {
  const old = JSON.parse(localStorage.getItem(KEY));
  if (old && typeof old === "object") {
    state = {
      ...state,
      ...old,
      page: Math.max(0, Math.min(2, Number(old.page) || 0)),
      selected: null
    };
  }
} catch (e) {}

function saved() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, selected: null }));
  } catch (e) {}
}

const entry = (p, s) => state.placements[`${p}-${s}`] || null;
const complete = p => PAGES[p].answer.every((a, i) => entry(p, i) === a);
const count = () => PAGES.filter((_, i) => complete(i)).length;

function put(slot, id) {
  if (!STICKERS.some(s => s.id === id)) return;
  state.placements[`${state.page}-${slot}`] = id;
  delete state.checked[state.page];
  state.selected = null;
  saved();
  render();
}

function renderScene(p, data) {
  const s0Id = entry(p, 0);
  const s1Id = entry(p, 1);
  const item0 = STICKERS.find(s => s.id === s0Id);
  const item1 = STICKERS.find(s => s.id === s1Id);

  // 1. 背景層
  $("stageBg").style.backgroundImage = `url('${data.bg}')`;

  // 2. 前景層
  $("stageFg").style.backgroundImage = `url('${data.fg}')`;

  // 3. 角色與物件層（分層插畫系統）
  let actorsHtml = "";

  const renderSlotActor = (slotIdx, item) => {
    if (!item) {
      // 繪本風空白預留位（柔和引導框，而非突兀的大加號）
      const layout = data.slotsLayout[slotIdx];
      return `<div class="stage-placeholder ${layout.defaultClass}" data-slot="${slotIdx}">
        <div class="placeholder-halo"></div>
        <span class="placeholder-hint">＋ ${layout.defaultLabel}</span>
      </div>`;
    }

    const customKey = `${slotIdx}-${item.id}`;
    const custom = data.customPlacement[customKey] || {};
    const posClass = custom.className || data.slotsLayout[slotIdx].defaultClass;

    return `<div class="stage-entity ${posClass} entity-${item.id}" data-slot="${slotIdx}">
      <img src="${item.src}" alt="${item.name}" class="entity-illustration" draggable="false" />
      <span class="entity-badge">${item.name}</span>
    </div>`;
  };

  actorsHtml += renderSlotActor(0, item0);
  actorsHtml += renderSlotActor(1, item1);
  $("stageActors").innerHTML = actorsHtml;

  // 4. 點選場景中的貼紙可直接取下（直覺操作）
  document.querySelectorAll(".stage-entity").forEach(el => {
    el.addEventListener("click", () => {
      const slot = Number(el.dataset.slot);
      delete state.placements[`${p}-${slot}`];
      delete state.checked[p];
      saved();
      render();
    });
  });

  // 點選空白插畫預留位也可以放置選取的貼紙
  document.querySelectorAll(".stage-placeholder").forEach(el => {
    el.addEventListener("click", () => {
      const slot = Number(el.dataset.slot);
      if (state.selected) {
        put(slot, state.selected);
      }
    });
  });

  // 5. 提示訊息（若尚未放置任何貼紙）
  const stageMsg = $("stageMessage");
  if (!item0 && !item1) {
    stageMsg.innerHTML = '<span class="stage-tip">✦ 點選或拖曳貼紙，讓角色與物件融入森林插畫</span>';
    stageMsg.style.display = "block";
  } else {
    stageMsg.style.display = "none";
  }
}

function render() {
  const p = state.page;
  const data = PAGES[p];
  const values = [entry(p, 0), entry(p, 1)].map(v => STICKERS.find(s => s.id === v)?.name);

  // 頂部進度與標題
  $("chapter").textContent = "CHAPTER 0" + (p + 1);
  $("pagecount").textContent = (p + 1) + " / 3";
  $("kicker").textContent = data.kicker;
  $("page-title").textContent = data.title;
  $("story").textContent = data.story(values);
  $("hint").textContent = data.hint;

  // 渲染分層插畫舞台
  renderScene(p, data);

  // 頁碼導航點
  $("dots").innerHTML = PAGES.map((_, i) =>
    `<span class="dot ${i === p ? "active" : ""}"></span>`
  ).join("");

  // 空格按鈕
  $("slots").innerHTML = data.labels.map((label, i) => {
    const selected = STICKERS.find(s => s.id === entry(p, i));
    const thumb = selected
      ? `<img src="${selected.src}" class="slot-thumb" alt="${selected.name}">`
      : `<span class="symbol">＋</span>`;
    return `<button class="slot ${selected ? "filled" : ""}" data-slot="${i}" aria-label="${label}，${selected ? selected.name : "未放置"}">
      <div class="slot-visual">${thumb}</div>
      <small>${selected ? selected.name : label}</small>
    </button>`;
  }).join("");

  // 貼紙匣（Stickers tray）
  $("stickers").innerHTML = STICKERS.map(s => {
    const isSelected = state.selected === s.id;
    return `<button class="sticker ${isSelected ? "selected" : ""}" draggable="true" data-id="${s.id}" aria-pressed="${isSelected}">
      <div class="sticker-card">
        <img src="${s.src}" class="sticker-thumb" alt="${s.name}" draggable="false" />
      </div>
      <span>${s.name}</span>
    </button>`;
  }).join("");

  // 導航按鈕狀態
  $("prev").disabled = p === 0;
  $("next").disabled = p === 2;

  // 故事完成度進度條
  const finishedCount = count();
  $("progressText").textContent = finishedCount + " / 3";
  $("progressBar").style.width = (finishedCount / 3 * 100) + "%";

  // 檢查結果回饋
  const result = $("result");
  result.className = "result";
  if (state.checked[p]) {
    const good = complete(p);
    result.textContent = good
      ? (finishedCount === 3
          ? "✦ 三頁故事全部完成！月光森林的秘密已全部解開。"
          : "✦ 這一頁的故事完美對應了！可以點擊下一頁繼續冒險。")
      : "故事的發展似乎有些不對勁，仔細閱讀線索再試試看吧！";
    if (good) result.classList.add("good");
  } else {
    result.textContent = "";
  }

  // 事件綁定：故事槽位的點擊與拖放
  document.querySelectorAll(".slot").forEach(el => {
    const i = Number(el.dataset.slot);
    el.addEventListener("click", () => {
      if (state.selected) {
        put(i, state.selected);
      } else if (entry(p, i)) {
        delete state.placements[`${p}-${i}`];
        delete state.checked[p];
        saved();
        render();
      }
    });

    el.addEventListener("dragover", e => {
      e.preventDefault();
      el.classList.add("dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("dragover"));
    el.addEventListener("drop", e => {
      e.preventDefault();
      put(i, e.dataTransfer.getData("text/plain"));
    });
  });

  // 事件綁定：貼紙的點擊、HTML5 Drag、觸控指引
  document.querySelectorAll(".sticker").forEach(el => {
    el.addEventListener("click", () => {
      state.selected = state.selected === el.dataset.id ? null : el.dataset.id;
      render();
    });

    el.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", el.dataset.id);
      e.dataTransfer.effectAllowed = "copy";
    });

    let x, y, moved = false;
    el.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;
      x = e.clientX;
      y = e.clientY;
      moved = false;
    });

    el.addEventListener("pointermove", e => {
      if (x !== undefined && Math.hypot(e.clientX - x, e.clientY - y) > 12) {
        moved = true;
      }
    });

    el.addEventListener("pointerup", e => {
      if (x === undefined) return;
      if (moved) {
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".slot, .stage-placeholder");
        if (target) {
          put(Number(target.dataset.slot), el.dataset.id);
        }
      }
      x = undefined;
      y = undefined;
    });
  });
}

// 翻頁、重置、檢查監聽
$("prev").addEventListener("click", () => {
  if (state.page > 0) {
    state.page--;
    state.selected = null;
    saved();
    render();
  }
});

$("next").addEventListener("click", () => {
  if (state.page < 2) {
    state.page++;
    state.selected = null;
    saved();
    render();
  }
});

$("check").addEventListener("click", () => {
  state.checked[state.page] = true;
  saved();
  render();
});

$("reset").addEventListener("click", () => {
  if (!confirm("確定要清除所有頁面的貼紙並重新開始嗎？")) return;
  state = { page: 0, placements: {}, selected: null, checked: {} };
  saved();
  render();
});

// 啟動渲染
render();

