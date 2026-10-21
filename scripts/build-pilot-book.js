#!/usr/bin/env node
/*
 * Build the pilot Book Package for 《彼得潘｜貼紙童話試作》.
 *
 * Deterministic generator: same inputs always produce the same JSON.
 * Writes books/peterpan-sticker-pilot/book.json only. No network, no eval,
 * no writes outside the repository.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "books", "peterpan-sticker-pilot");
const OUT_FILE = path.join(OUT_DIR, "book.json");

/* ---------- small helpers ---------- */

const text = (value) => ({ type: "text", value });
const slot = (slotId) => ({ type: "slot", slotId });
const zh = (value) => ({ "zh-Hant": value });

// Legacy scene anchors: [left%, bottom%, width%] on a 4:3 stage.
// Height keeps the 200x260 transparent sticker canvas (legacy formula).
function frame(left, bottom, width) {
  const height = Math.min(68, (width * 4) / (3 * 0.75));
  return {
    left: left,
    bottom: bottom,
    width: width,
    height: Math.round(height * 100) / 100
  };
}

/* ---------- stickers ---------- */

const STICKERS = [
  {
    id: "peter",
    label: "彼得潘",
    storyLabel: "彼得潘",
    kind: "character",
    defaultAsset: "assets/peter.svg",
    variants: {
      "sky-flyer": "assets/peter-flying.svg",
      "sky-magic": "assets/peter-flying.svg"
    }
  },
  {
    id: "wendy",
    label: "溫蒂",
    storyLabel: "溫蒂",
    kind: "character",
    defaultAsset: "assets/wendy.svg",
    variants: {
      "sky-flyer": "assets/wendy-flying.svg",
      "sky-magic": "assets/wendy-flying.svg"
    }
  },
  {
    id: "boys",
    label: "迷失男孩",
    storyLabel: "迷失男孩",
    kind: "character",
    defaultAsset: "assets/boys.svg",
    variants: {
      "sky-flyer": "assets/boys-flying.svg",
      "sky-magic": "assets/boys-flying.svg",
      "forest-helper": "assets/boys-building.svg"
    }
  },
  {
    id: "shadow",
    label: "影子",
    storyLabel: "影子",
    kind: "prop",
    defaultAsset: "assets/shadow.svg",
    variants: {
      "room-discovery": "assets/shadow-floor.svg",
      "sky-flyer": "assets/shadow-flying.svg",
      "sky-magic": "assets/shadow-flying.svg"
    }
  },
  {
    id: "dust",
    label: "仙塵",
    storyLabel: "仙塵",
    kind: "prop",
    defaultAsset: "assets/dust.svg",
    variants: {
      "sky-flyer": "assets/dust-flying.svg",
      "sky-magic": "assets/dust-flying.svg"
    }
  },
  {
    id: "house",
    label: "樹葉小屋",
    storyLabel: "樹葉小屋",
    kind: "prop",
    defaultAsset: "assets/house.svg",
    variants: {
      "sky-flyer": "assets/house-flying.svg",
      "sky-magic": "assets/house-flying.svg"
    }
  }
];

/* ---------- pages ---------- */

const PAGES = [
  {
    id: "p1",
    chapterId: "ch1",
    title: "窗邊的祕密",
    kicker: "第一章 · 育兒室",
    clue: "誰發現了育兒室裡的祕密？又留下了什麼？",
    sceneAsset: "assets/room.svg",
    sceneRole: "room",
    slots: [
      {
        id: "visitor",
        role: "room-visitor",
        frame: frame(20, 9, 25),
        hint: "一位發現祕密的女孩"
      },
      {
        id: "clue",
        role: "room-discovery",
        frame: frame(54, 9, 18),
        hint: "一片會偷偷逃跑的東西"
      }
    ],
    paragraphs: [
      {
        id: "p1-t1",
        parts: [
          text("倫敦的夜晚，月光輕輕灑在育兒室的地板上。"),
          slot("visitor"),
          text("聽見窗邊傳來一陣小小的笑聲，便走近查看。")
        ]
      },
      {
        id: "p1-t2",
        parts: [
          text("她低下頭，看見地板上遺落了"),
          slot("clue"),
          text("。原來那位神祕的訪客，真的曾經來過這個房間。")
        ]
      }
    ]
  },
  {
    id: "p2",
    chapterId: "ch1",
    title: "第二顆星的方向",
    kicker: "第一章 · 倫敦上空",
    clue: "誰帶領孩子們出發？哪種魔法讓大家飛起來？",
    sceneAsset: "assets/sky.svg",
    sceneRole: "sky",
    slots: [
      {
        id: "hero",
        role: "sky-flyer",
        frame: frame(28, 22, 22),
        hint: "一位會飛的男孩"
      },
      {
        id: "magic",
        role: "sky-magic",
        frame: frame(58, 21, 15),
        hint: "一瓶會發光的魔法"
      }
    ],
    paragraphs: [
      {
        id: "p2-t1",
        parts: [
          text("窗外的倫敦愈來愈小，"),
          slot("hero"),
          text("在雲端回頭微笑，邀請朋友們一起飛行。")
        ]
      },
      {
        id: "p2-t2",
        parts: [
          text("他撒下"),
          slot("magic"),
          text("，星光便圍著孩子們轉圈。月亮安靜地守在天際，而全新的冒險才剛開始。")
        ]
      }
    ]
  },
  {
    id: "p3",
    chapterId: "ch1",
    title: "為朋友蓋一座小屋",
    kicker: "第一章 · 夢幻島",
    clue: "誰忙著幫溫蒂蓋房子？他們蓋出什麼？",
    sceneAsset: "assets/forest.svg",
    sceneRole: "forest",
    slots: [
      {
        id: "helper",
        role: "forest-helper",
        frame: frame(16, 9, 28),
        hint: "一群想交朋友的孩子"
      },
      {
        id: "result",
        role: "forest-result",
        frame: frame(45, 12, 28),
        hint: "一間用樹葉搭成的小屋"
      }
    ],
    paragraphs: [
      {
        id: "p3-t1",
        parts: [
          text("夢幻島的森林裡，"),
          slot("helper"),
          text("忙著搬樹枝、撿花朵，希望讓新朋友有個能安心休息的地方。")
        ]
      },
      {
        id: "p3-t2",
        parts: [
          text("不一會兒，草地上出現了"),
          slot("result"),
          text("。森林裡充滿笑聲，大家開心地邀請溫蒂住下。")
        ]
      }
    ]
  }
];

const PAGE_PARAGRAPH_IDS = PAGES.reduce((acc, page) => {
  acc[page.id] = page.paragraphs.map((paragraph) => paragraph.id);
  return acc;
}, {});

const SLOT_HINT = PAGES.reduce((acc, page) => {
  page.slots.forEach((s) => {
    acc[page.id + "." + s.id] = s.hint;
  });
  return acc;
}, {});

/* ---------- rules ---------- */

// Each rule owns one narrative variant. Variant paragraphs reuse the stable
// page paragraph ids so downstream readers can swap text without breaking
// paragraph references.
const RULES = [
  {
    id: "p1-wendy-shadow",
    pageId: "p1",
    priority: 100,
    group: "main",
    eventId: "shadowRecovered",
    when: { all: [{ slotEquals: ["visitor", "wendy"] }, { slotEquals: ["clue", "shadow"] }] },
    setFacts: { shadowRecovered: true, windowOpen: true },
    variantOverrides: { clue: "assets/shadow-floor.svg" },
    variant: { paragraph: "p1-t2", parts: [text("她低下頭，看見地板上遺落了"), slot("clue"), text("——那正是彼得留下的記號，影子悄悄記住了那位女孩。")] }
  },
  {
    id: "p1-peter-shadow",
    pageId: "p1",
    priority: 99,
    group: "main",
    eventId: "peterClaimsShadow",
    when: { all: [{ slotEquals: ["visitor", "peter"] }, { slotEquals: ["clue", "shadow"] }] },
    setFacts: { shadowRecovered: true, peterArrived: true },
    variantOverrides: { clue: "assets/shadow-floor.svg" },
    variant: { paragraph: "p1-t2", parts: [text("地板上遺落了"), slot("clue"), text("，而偷看的人正是他自己，影子偷偷躲進了角落。")] }
  },
  {
    id: "p1-wendy-dust",
    pageId: "p1",
    priority: 95,
    group: "main",
    eventId: "dustSparkFound",
    when: { all: [{ slotEquals: ["visitor", "wendy"] }, { slotEquals: ["clue", "dust"] }] },
    setFacts: { dustFound: true },
    variant: { paragraph: "p1-t2", parts: [text("地板上散落著"), slot("clue"), text("，一點點星光在木地板上滾動，像在招呼她。")] }
  },
  {
    id: "p1-peter-dust",
    pageId: "p1",
    priority: 94,
    group: "main",
    eventId: "dustWithPeter",
    when: { all: [{ slotEquals: ["visitor", "peter"] }, { slotEquals: ["clue", "dust"] }] },
    setFacts: { dustFound: true, peterArrived: true },
    variant: { paragraph: "p1-t2", parts: [text("地板上散落著"), slot("clue"), text("，他笑著說：這些星星是我撒的，來不及收乾淨了。")] }
  },
  {
    id: "p1-boys-shadow",
    pageId: "p1",
    priority: 90,
    group: "main",
    eventId: "boysChaseShadow",
    when: { all: [{ slotEquals: ["visitor", "boys"] }, { slotEquals: ["clue", "shadow"] }] },
    setFacts: { shadowRecovered: true },
    variant: { paragraph: "p1-t2", parts: [text("他們追著"), slot("clue"), text("跑過月光的窗邊，笑聲撞在玻璃上又彈回來。")] }
  },
  {
    id: "p1-wendy-house",
    pageId: "p1",
    priority: 89,
    group: "main",
    eventId: "houseInNursery",
    when: { all: [{ slotEquals: ["visitor", "wendy"] }, { slotEquals: ["clue", "house"] }] },
    setFacts: { houseAppeared: true },
    variant: { paragraph: "p1-t2", parts: [text("地板上竟然出現了"), slot("clue"), text("，葉子的味道讓整個房間像搬進了森林。")] }
  },
  {
    id: "p1-boys-house",
    pageId: "p1",
    priority: 84,
    group: "main",
    eventId: "boysClaimHouse",
    when: { all: [{ slotEquals: ["visitor", "boys"] }, { slotEquals: ["clue", "house"] }] },
    setFacts: { houseAppeared: true },
    variant: { paragraph: "p1-t2", parts: [text("他們圍著"), slot("clue"), text("討論要再添幾根樹枝，才好把屋頂蓋得牢固。")] }
  },
  {
    id: "p1-dust-house",
    pageId: "p1",
    priority: 85,
    group: "main",
    eventId: "dustOverHouse",
    when: { all: [{ slotEquals: ["visitor", "dust"] }, { slotEquals: ["clue", "house"] }] },
    setFacts: { dustFound: true, houseAppeared: true },
    variant: { paragraph: "p1-t2", parts: [text("月光落在"), slot("clue"), text("上，"), slot("visitor"), text("繞著屋頂慢慢打轉。")] }
  },
  {
    id: "p1-shadow-visitor",
    pageId: "p1",
    priority: 60,
    group: "main",
    eventId: "shadowInVisitorSlot",
    when: { slotEquals: ["visitor", "shadow"] },
    setFacts: { shadowSeen: true },
    variant: { paragraph: "p1-t1", parts: [text("倫敦的夜晚，月光輕輕灑在育兒室的地板上。"), slot("visitor"), text("先一步滑過走廊，把整個房間的輪廓都描了出來。")] }
  },
  {
    id: "p1-any",
    pageId: "p1",
    priority: 0,
    group: "main",
    eventId: "roomDiscovery",
    when: { any: [{ slotFilled: "visitor" }, { slotFilled: "clue" }] },
    setFacts: { roomExplored: true },
    variant: { paragraph: "p1-t2", parts: [text("地板上留下了"), slot("clue"), text("，還看不出是誰的魔法，但育兒室確實醒來了。")] }
  },
  {
    id: "p2-after-shadow",
    pageId: "p2",
    priority: 120,
    group: "main",
    eventId: "fliesAfterShadow",
    when: { all: [{ factEquals: ["shadowRecovered", true] }, { slotEquals: ["hero", "peter"] }, { slotEmpty: "magic" }] },
    setFacts: { flewAfterShadow: true },
    variant: { paragraph: "p2-t2", parts: [text("他沒有撒下"), slot("magic"), text("，只是回頭朝育兒室的方向揮手，影子留下的記號替他指了路。")] }
  },
  {
    id: "p2-peter-dust",
    pageId: "p2",
    priority: 100,
    group: "main",
    eventId: "tookFlight",
    when: { all: [{ slotEquals: ["hero", "peter"] }, { slotEquals: ["magic", "dust"] }] },
    setFacts: { flewWithDust: true },
    variantOverrides: { hero: "assets/peter-flying.svg", magic: "assets/dust-flying.svg" },
    variant: { paragraph: "p2-t2", parts: [text("他撒下"), slot("magic"), text("，星光便圍著孩子們轉圈，月亮安靜地守在天際。")] }
  },
  {
    id: "p2-wendy-dust",
    pageId: "p2",
    priority: 99,
    group: "main",
    eventId: "wendyLearnsToFly",
    when: { all: [{ slotEquals: ["hero", "wendy"] }, { slotEquals: ["magic", "dust"] }] },
    setFacts: { dustFound: true },
    variant: { paragraph: "p2-t2", parts: [text("他撒下"), slot("magic"), text("，她抓著衣角試了三次，第四次終於離開了倫敦的屋頂。")] }
  },
  {
    id: "p2-boys-dust",
    pageId: "p2",
    priority: 98,
    group: "main",
    eventId: "boysCatchDust",
    when: { all: [{ slotEquals: ["hero", "boys"] }, { slotEquals: ["magic", "dust"] }] },
    setFacts: { dustFound: true },
    variant: { paragraph: "p2-t2", parts: [text("他撒下"), slot("magic"), text("，孩子們在雲裡爭先恐後地伸手，星光落進了每一個口袋。")] }
  },
  {
    id: "p2-peter-shadow",
    pageId: "p2",
    priority: 90,
    group: "main",
    eventId: "shadowRidesAlong",
    when: { all: [{ slotEquals: ["hero", "peter"] }, { slotEquals: ["magic", "shadow"] }] },
    setFacts: { shadowRecovered: true, flewWithDust: false },
    variant: { paragraph: "p2-t2", parts: [text("他伸手去抓"), slot("magic"), text("，指尖卻穿過一片薄薄的影子——那不是可以撒出去的東西。")] }
  },
  {
    id: "p2-wendy-shadow",
    pageId: "p2",
    priority: 89,
    group: "main",
    eventId: "shadowFollowsWendy",
    when: { all: [{ slotEquals: ["hero", "wendy"] }, { slotEquals: ["magic", "shadow"] }] },
    setFacts: { shadowRecovered: true },
    variant: { paragraph: "p2-t2", parts: [text("她懷裡抱著"), slot("magic"), text("，影子被風拉長，像一件忘了脫下的披風。")] }
  },
  {
    id: "p2-peter-house",
    pageId: "p2",
    priority: 85,
    group: "main",
    eventId: "houseFlewToo",
    when: { all: [{ slotEquals: ["hero", "peter"] }, { slotEquals: ["magic", "house"] }] },
    setFacts: { houseAppeared: true },
    variant: { paragraph: "p2-t2", parts: [text("他伸手去抓"), slot("magic"), text("，小屋跟著飛起來，屋頂上的葉子被風吹得沙沙作響。")] }
  },
  {
    id: "p2-peter-no-fact",
    pageId: "p2",
    priority: 80,
    group: "main",
    eventId: "peterWaitsForShadow",
    when: { all: [{ slotEquals: ["hero", "peter"] }, { factMissing: "shadowRecovered" }, { slotEmpty: "magic" }] },
    setFacts: { waitingForShadow: true },
    variant: { paragraph: "p2-t2", parts: [text("他等了又等，還沒有人找到"), slot("magic"), text("，所以這一趟飛行還沒有真正的起點。")] }
  },
  {
    id: "p2-any",
    pageId: "p2",
    priority: 0,
    group: "main",
    eventId: "skyDiscovery",
    when: { any: [{ slotFilled: "hero" }, { slotFilled: "magic" }] },
    setFacts: { skyExplored: true },
    variant: { paragraph: "p2-t2", parts: [text("雲端安靜下來，"), slot("magic"), text("也沒有飛起來——孩子們只是安靜地看了一會兒倫敦的燈火。")] }
  },
  {
    id: "p3-after-dust",
    pageId: "p3",
    priority: 110,
    group: "main",
    eventId: "forestWithDust",
    when: { all: [{ factEquals: ["flewWithDust", true] }, { slotEquals: ["helper", "boys"] }] },
    setFacts: { dustCarriedToForest: true },
    variant: { paragraph: "p3-t1", parts: [text("夢幻島的森林裡，"), slot("helper"), text("帶著從倫敦一路跟來的星光，一邊撿樹枝一邊哼著歌。")] }
  },
  {
    id: "p3-boys-house",
    pageId: "p3",
    priority: 100,
    group: "main",
    eventId: "forestHomeBuilt",
    when: { all: [{ slotEquals: ["helper", "boys"] }, { slotEquals: ["result", "house"] }] },
    setFacts: { homeBuilt: true },
    variantOverrides: { helper: "assets/boys-building.svg" },
    variant: { paragraph: "p3-t2", parts: [text("不一會兒，草地上出現了"), slot("result"), text("，屋頂還搭著剛才撿回來的樹枝，散發著森林的氣味。")] }
  },
  {
    id: "p3-boys-only",
    pageId: "p3",
    priority: 89,
    group: "main",
    eventId: "boysGatherBranches",
    when: { slotEquals: ["helper", "boys"] },
    setFacts: { branchesGathered: true },
    variantOverrides: { helper: "assets/boys-building.svg" },
    variant: { paragraph: "p3-t2", parts: [text("他們把樹枝堆在草地上，"), slot("result"), text("還差最後幾根，房間大概就搭得起來了。")] }
  },
  {
    id: "p3-house-only",
    pageId: "p3",
    priority: 90,
    group: "main",
    eventId: "houseWaitsForBuilders",
    when: { slotEquals: ["result", "house"] },
    setFacts: { houseAppeared: true },
    variant: { paragraph: "p3-t1", parts: [text("夢幻島的森林裡，"), slot("helper"), text("還沒輪到誰，"), slot("result"), text("就先自己長在草地上等人。")] }
  },
  {
    id: "p3-wendy-house",
    pageId: "p3",
    priority: 85,
    group: "main",
    eventId: "wendyFindsHome",
    when: { all: [{ slotEquals: ["helper", "wendy"] }, { slotEquals: ["result", "house"] }] },
    setFacts: { homeBuilt: true, wendyArrived: true },
    variant: { paragraph: "p3-t2", parts: [text("不一會兒，草地上出現了"), slot("result"), text("，她在門口站了一會兒，才敢相信這是給自己的房間。")] }
  },
  {
    id: "p3-peter-house",
    pageId: "p3",
    priority: 84,
    group: "main",
    eventId: "peterInspectsHouse",
    when: { all: [{ slotEquals: ["helper", "peter"] }, { slotEquals: ["result", "house"] }] },
    setFacts: { homeBuilt: true, peterArrived: true },
    variant: { paragraph: "p3-t2", parts: [text("不一會兒，草地上出現了"), slot("result"), text("，他在門框上敲了兩下，確認它夠不夠結實。")] }
  },
  {
    id: "p3-boys-shadow",
    pageId: "p3",
    priority: 70,
    group: "main",
    eventId: "boysAndShadow",
    when: { all: [{ slotEquals: ["helper", "boys"] }, { slotEquals: ["result", "shadow"] }] },
    setFacts: { shadowRecovered: true },
    variant: { paragraph: "p3-t2", parts: [text("樹影被拉得又長又扁，孩子們說那是"), slot("result"), text("，還差一點點就成了房子。")] }
  },
  {
    id: "p3-any",
    pageId: "p3",
    priority: 0,
    group: "main",
    eventId: "forestDiscovery",
    when: { any: [{ slotFilled: "helper" }, { slotFilled: "result" }] },
    setFacts: { forestExplored: true },
    variant: { paragraph: "p3-t2", parts: [text("不一會兒，草地上出現了"), slot("result"), text("，森林看起來還在慢慢想怎麼歡迎客人。")] }
  }
];

/* ---------- narratives ---------- */

function buildNarratives() {
  return RULES.map((rule) => {
    const pageParagraphs = PAGE_PARAGRAPH_IDS[rule.pageId];
    const paragraphs = pageParagraphs.map((id) => {
      if (id === rule.variant.paragraph) {
        return { id: id, parts: rule.variant.parts };
      }
      const source = PAGES.find((page) => page.id === rule.pageId).paragraphs.find(
        (paragraph) => paragraph.id === id
      );
      return { id: id, parts: source.parts };
    });
    return {
      id: "n-" + rule.id,
      pageId: rule.pageId,
      paragraphs: paragraphs
    };
  });
}

/* ---------- narration ---------- */

function plainText(parts, pageId) {
  return parts
    .map((part) => {
      if (part.type === "text") return part.value;
      return SLOT_HINT[pageId + "." + part.slotId] || "貼紙";
    })
    .join("");
}

function buildNarration(narratives) {
  const segments = [];
  PAGES.forEach((page) => {
    page.paragraphs.forEach((paragraph) => {
      segments.push({
        id: "seg-" + paragraph.id + "-base",
        paragraphId: paragraph.id,
        variantNarrativeId: null,
        speakerId: "narrator",
        locale: "zh-Hant",
        spokenText: plainText(paragraph.parts, page.id),
        audioAsset: null,
        timings: null
      });
    });
    narratives
      .filter((narrative) => narrative.pageId === page.id)
      .forEach((narrative) => {
        narrative.paragraphs.forEach((paragraph) => {
          segments.push({
            id: "seg-" + paragraph.id + "-" + narrative.id,
            paragraphId: paragraph.id,
            variantNarrativeId: narrative.id,
            speakerId: "narrator",
            locale: "zh-Hant",
            spokenText: plainText(paragraph.parts, page.id),
            audioAsset: null,
            timings: null
          });
        });
      });
  });
  return { version: 1, segments: segments };
}

/* ---------- assets ---------- */

const SCENE_FILES = ["room.svg", "sky.svg", "forest.svg"];
const STICKER_FILES = [
  "peter.svg",
  "peter-flying.svg",
  "wendy.svg",
  "wendy-flying.svg",
  "boys.svg",
  "boys-flying.svg",
  "boys-building.svg",
  "shadow.svg",
  "shadow-floor.svg",
  "shadow-flying.svg",
  "dust.svg",
  "dust-flying.svg",
  "house.svg",
  "house-flying.svg"
];

function buildAssets() {
  const assets = SCENE_FILES.map((file) => ({
    path: "assets/" + file,
    kind: "scene",
    rightsReview: "pending",
    author: "project-original",
    provenance: "sticker-demo/art/" + file
  }));
  STICKER_FILES.forEach((file) => {
    assets.push({
      path: "assets/" + file,
      kind: "sticker",
      rightsReview: "pending",
      author: "project-original",
      provenance: "sticker-demo/art/" + file
    });
  });
  return assets;
}

/* ---------- assemble ---------- */

const narratives = buildNarratives();
const book = {
  schemaVersion: "1.0.0",
  bookId: "peterpan-sticker-pilot",
  title: zh("彼得潘｜貼紙童話試作"),
  source: {
    work: "Peter and Wendy",
    author: "J. M. Barrie",
    edition: "1911",
    rightsReview: "pending",
    draftOrigin: "ai-generated",
    translation: "本專案繁體中文改寫",
    translationCredit: "待指定",
    notes: "第四本為互動貼紙試作；原著與新譯文、插圖之權利仍待人工審核。"
  },
  artStyleId: "cozy-sticker-v1",
  chapters: [
    { id: "ch1", title: zh("貼紙童話試作"), pageIds: ["p1", "p2", "p3"] }
  ],
  stickers: STICKERS.map((sticker) => ({
    id: sticker.id,
    label: zh(sticker.label),
    storyLabel: sticker.storyLabel,
    kind: sticker.kind,
    defaultAsset: sticker.defaultAsset,
    variants: sticker.variants
  })),
  pages: PAGES.map((page) => ({
    id: page.id,
    chapterId: page.chapterId,
    title: zh(page.title),
    kicker: page.kicker,
    clue: zh(page.clue),
    sceneAsset: page.sceneAsset,
    sceneRole: page.sceneRole,
    slots: page.slots.map((s) => ({
      id: s.id,
      role: s.role,
      frame: s.frame,
      hint: zh(s.hint)
    })),
    paragraphs: page.paragraphs,
    ruleIds: RULES.filter((rule) => rule.pageId === page.id).map((rule) => rule.id)
  })),
  rules: RULES.map((rule) => {
    const then = { eventId: rule.eventId };
    if (rule.setFacts) then.setFacts = rule.setFacts;
    if (rule.clearFacts) then.clearFacts = rule.clearFacts;
    then.narrativeId = "n-" + rule.id;
    if (rule.variantOverrides) then.variantOverrides = rule.variantOverrides;
    return {
      id: rule.id,
      pageId: rule.pageId,
      priority: rule.priority,
      group: rule.group || "main",
      when: rule.when,
      then: then
    };
  }),
  narratives: narratives,
  narration: buildNarration(narratives),
  assets: buildAssets()
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(book, null, 2) + "\n", "utf8");

const eventIds = new Set(book.rules.map((rule) => rule.then.eventId));
process.stdout.write(
  "wrote " +
    path.relative(ROOT, OUT_FILE) +
    "\npages=" +
    book.pages.length +
    " stickers=" +
    book.stickers.length +
    " rules=" +
    book.rules.length +
    " events=" +
    eventIds.size +
    " narratives=" +
    book.narratives.length +
    " segments=" +
    book.narration.segments.length +
    "\n"
);
