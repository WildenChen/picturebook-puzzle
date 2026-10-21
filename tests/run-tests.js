#!/usr/bin/env node
/*
 * Dependency-free test runner for the v1 book platform core.
 *
 *   node tests/run-tests.js
 *
 * Covers: Book Package validation (valid + hostile fixtures), the 36 placement
 * matrix, event variety, cross-page causality, full recomputation, stable rule
 * ordering, and variant fallback behaviour.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const schema = JSON.parse(
  fs.readFileSync(path.join(ROOT, "schemas", "book.schema.json"), "utf8")
);
const validator = require(path.join(ROOT, "src", "shared", "book-validator.js"));
const stateMachine = require(path.join(ROOT, "src", "core", "state-machine.js"));
const variantResolver = require(path.join(ROOT, "src", "core", "variant-resolver.js"));
const ruleEvaluator = require(path.join(ROOT, "src", "core", "rule-evaluator.js"));
const assetSafety = require(path.join(ROOT, "src", "shared", "asset-safety.js"));
const saveAdapter = require(path.join(ROOT, "src", "player", "save-adapter.js"));
const editorZip = require(path.join(ROOT, "src", "editor", "zip.js"));

const BOOK = JSON.parse(
  fs.readFileSync(path.join(ROOT, "books", "peterpan-sticker-pilot", "book.json"), "utf8")
);
const FIXTURE_DIR = path.join(__dirname, "fixtures");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write("  ok   " + name + "\n");
  } catch (error) {
    failed += 1;
    failures.push({ name: name, error: error });
    process.stdout.write("  FAIL " + name + "\n         " + error.message + "\n");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function section(title) {
  process.stdout.write("\n" + title + "\n");
}

/* ---------------- validation ---------------- */

section("Book Package 驗證");

test("有效封包通過驗證", function () {
  const result = validator.validateBook(BOOK, schema, {
    assetRoot: path.join(ROOT, "books", "peterpan-sticker-pilot")
  });
  assert(result.errors.length === 0, JSON.stringify(result.errors, null, 2));
});

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

function expectInvalid(name, file, pathHint) {
  test(name, function () {
    const result = validator.validateBook(fixture(file), schema, {
      assetRoot: path.join(ROOT, "books", "peterpan-sticker-pilot")
    });
    assert(result.errors.length > 0, "預期有錯誤，但驗證通過了");
    if (pathHint) {
      const matched = result.errors.some((error) => error.path.indexOf(pathHint) === 0);
      assert(matched, "錯誤未指向預期路徑 " + pathHint + "，實際：" + JSON.stringify(result.errors));
    }
  });
}

expectInvalid("缺少 pageId 的敘事被拒絕", "invalid-missing-page-id.json", "/narratives");
expectInvalid("重複 ID 被拒絕", "invalid-duplicate-id.json", "/");
expectInvalid("錯 slot 引用被拒絕", "invalid-bad-slot-ref.json", "/");
expectInvalid("未知 schemaVersion 被拒絕", "invalid-unknown-schema-version.json", "/schemaVersion");
expectInvalid("缺素材檔被拒絕", "invalid-missing-asset.json", "/");
expectInvalid("外部 SVG URL 被拒絕", "invalid-external-svg.json", "/");
expectInvalid("含 ../ 的路徑被拒絕", "invalid-parent-path.json", "/");
expectInvalid("惡意 SVG 被拒絕", "invalid-malicious-svg.json", "/");
expectInvalid("未宣告欄位被拒絕", "invalid-unknown-field.json", "/");
expectInvalid("錯誤朗讀引用被拒絕", "invalid-narration-ref.json", "/narration");

test("同 priority 規則不報錯，只提示穩定排序", function () {
  const copy = JSON.parse(JSON.stringify(BOOK));
  copy.rules.push({
    id: "zz-tie-rule",
    pageId: "p1",
    priority: 100,
    group: "main",
    when: { slotEquals: ["visitor", "wendy"] },
    then: { eventId: "tieEvent", narrativeId: "n-p1-wendy-shadow" }
  });
  const result = validator.validateBook(copy, schema);
  assert(result.errors.length === 0, JSON.stringify(result.errors));
  assert(
    result.warnings.some((warning) => warning.message.indexOf("相同 priority") !== -1),
    "預期出現同 priority 警告"
  );
});

test("封包層級標示 approved 但素材未核准時產生警告（AC-009）", function () {
  const copy = JSON.parse(JSON.stringify(BOOK));
  copy.source.rightsReview = "approved";
  copy.assets[0].rightsReview = "pending";
  const result = validator.validateBook(copy, schema);
  assert(result.errors.length === 0, JSON.stringify(result.errors));
  assert(
    result.warnings.some(
      (warning) =>
        warning.path === "/source/rightsReview" &&
        warning.message.indexOf("未核准") !== -1
    ),
    "預期出現權利一致性警告：" + JSON.stringify(result.warnings)
  );
});

test("待審封包不因權利狀態而驗證失敗（AC-009）", function () {
  const copy = JSON.parse(JSON.stringify(BOOK));
  copy.source.rightsReview = "pending";
  copy.assets.forEach((asset) => {
    asset.rightsReview = "pending";
  });
  const result = validator.validateBook(copy, schema);
  assert(result.errors.length === 0, JSON.stringify(result.errors));
  assert(
    !result.warnings.some((warning) => warning.path === "/source/rightsReview"),
    "一致的待審狀態不應產生權利警告"
  );
});

test("新 runtime 與封包不含任何 API key 或 secret（AC-009）", function () {
  /*
   * AC-009 requires evidence that no credential leaks through the shipped
   * reader, editor or package. `scripts/agnes_draw.py` is a local authoring
   * tool that reads secrets from outside the repository, so it is excluded
   * on purpose: it never contains a key value itself.
   */
  const SCAN_ROOTS = ["src", "schemas", "books", "tests", "editor.html", "reader-pilot.html"];
  const SECRET_PATTERNS = [
    /sk-[A-Za-z0-9]{16,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/
  ];
  const offenders = [];

  function scan(target) {
    const absolute = path.join(ROOT, target);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      fs.readdirSync(absolute).forEach(function (entry) {
        if (entry === "__pycache__" || entry === "artifacts") return;
        scan(path.join(target, entry));
      });
      return;
    }
    if (!/\.(js|json|html|css|svg|md)$/.test(target)) return;
    const content = fs.readFileSync(absolute, "utf8");
    SECRET_PATTERNS.forEach(function (pattern) {
      if (pattern.test(content)) offenders.push(target + " matches " + pattern);
    });
  }

  SCAN_ROOTS.forEach(scan);
  assert(offenders.length === 0, "發現疑似 secret：" + offenders.join("; "));

  /* The package must not carry credential-shaped metadata either. */
  const serialized = JSON.stringify(BOOK);
  SECRET_PATTERNS.forEach(function (pattern) {
    assert(!pattern.test(serialized), "封包含疑似 secret：" + pattern);
  });
});

test("可核准的審核樣本存在且通過驗證、不產生權利警告（AC-009）", function () {
  const samplePath = path.join(
    ROOT,
    "books",
    "peterpan-sticker-pilot",
    "approved-rights-sample.json"
  );
  assert(fs.existsSync(samplePath), "缺少可核准的審核樣本");
  const sample = JSON.parse(fs.readFileSync(samplePath, "utf8"));
  const result = validator.validateBook(sample, schema, {
    assetRoot: path.dirname(samplePath)
  });
  assert(result.errors.length === 0, JSON.stringify(result.errors));
  assert(
    !result.warnings.some((warning) => warning.path.indexOf("/source/") === 0),
    "已簽認的樣本不應產生權利警告：" + JSON.stringify(result.warnings)
  );
  assert(sample.source.rightsReview === "approved");
  assert(sample.source.rightsApprovedBy && sample.source.rightsApprovedAt);
  assert(sample.source.draftOrigin === "ai-generated");
});

test("approved 但缺少人工簽認者與時間時產生警告（AC-009）", function () {
  const copy = JSON.parse(JSON.stringify(BOOK));
  copy.source.rightsReview = "approved";
  copy.assets.forEach((asset) => {
    asset.rightsReview = "approved";
  });
  const result = validator.validateBook(copy, schema);
  assert(result.errors.length === 0, JSON.stringify(result.errors));
  const paths = result.warnings.map((warning) => warning.path);
  assert(paths.indexOf("/source/rightsApprovedBy") !== -1, JSON.stringify(paths));
  assert(paths.indexOf("/source/rightsApprovedAt") !== -1, JSON.stringify(paths));
  assert(paths.indexOf("/source/translationCredit") !== -1, JSON.stringify(paths));
});

test("正式封包維持 pending 且不得自行升格為 approved（AC-009）", function () {
  assert(BOOK.source.rightsReview === "pending", BOOK.source.rightsReview);
  BOOK.assets.forEach((asset) => {
    assert(asset.rightsReview === "pending", asset.path + " = " + asset.rightsReview);
  });
  assert(!BOOK.source.rightsApprovedBy, "正式封包不應帶有簽認者");
  assert(BOOK.source.draftOrigin === "ai-generated", BOOK.source.draftOrigin);
});

/* ---------------- core engine ---------------- */

section("素材安全");

test("含 script 的 SVG 被判定為不安全", function () {
  const problems = assetSafety.screenSvgContent(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  );
  assert(problems.length > 0, "應偵測到 script");
});

test("含 onload 事件屬性的 SVG 被判定為不安全", function () {
  const problems = assetSafety.screenSvgContent(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>'
  );
  assert(problems.length > 0, "應偵測到 onload");
});

test("含外部參照的 SVG 被判定為不安全", function () {
  const problems = assetSafety.screenSvgContent(
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>'
  );
  assert(problems.length > 0, "應偵測到外部參照");
});

test("正常 SVG 通過安全檢查", function () {
  const problems = assetSafety.screenSvgContent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><path d="M10 10 L20 20" fill="#333"/></svg>'
  );
  assert(problems.length === 0, "一般 SVG 不應被判定不安全：" + problems.join(", "));
});

test("封包內所有實際 SVG 素材皆通過安全檢查", function () {
  const assetRoot = path.join(ROOT, "books", "peterpan-sticker-pilot");
  const result = assetSafety.checkPackageAssets(BOOK, { assetRoot: assetRoot });
  assert(result.errors.length === 0, JSON.stringify(result.errors, null, 2));
});

section("核心引擎");

const STICKER_IDS = BOOK.stickers.map((sticker) => sticker.id);

function withSticker(pageId, slotId, stickerId) {
  const placements = {};
  placements[pageId] = {};
  placements[pageId][slotId] = stickerId;
  return placements;
}

test("36 種單一位置替換全部產生有效事件", function () {
  let combos = 0;
  BOOK.pages.forEach((page) => {
    page.slots.forEach((slot) => {
      STICKER_IDS.forEach((stickerId) => {
        const placements = withSticker(page.id, slot.id, stickerId);
        const state = stateMachine.computeState(BOOK, placements);
        const pageState = state.pages[page.id];
        assert(pageState, "頁面狀態缺失：" + page.id);
        assert(pageState.eventId, "事件 ID 缺失：" + page.id + " " + slot.id);
        assert(pageState.paragraphs.length > 0, "段落缺失");
        combos += 1;
      });
    });
  });
  assert(combos === 36, "預期 36 種組合，實際 " + combos);
});

test("全部 6×6 完整組合皆可計算且不崩潰", function () {
  let combos = 0;
  BOOK.pages.forEach((page) => {
    STICKER_IDS.forEach((first) => {
      STICKER_IDS.forEach((second) => {
        const placements = {};
        placements[page.id] = {};
        page.slots.forEach((slot, index) => {
          placements[page.id][slot.id] = index === 0 ? first : second;
        });
        const state = stateMachine.computeState(BOOK, placements);
        assert(state.pages[page.id].eventId, "事件缺失");
        combos += 1;
      });
    });
  });
  assert(combos === 108, "預期 108 種組合，實際 " + combos);
});

test("slot 框大小不因貼紙 ID 或對錯而改變", function () {
  const page = BOOK.pages[0];
  const slot = page.slots[0];
  const frames = new Set();
  STICKER_IDS.forEach((stickerId) => {
    const placements = withSticker(page.id, slot.id, stickerId);
    const state = stateMachine.computeState(BOOK, placements);
    const resolved = state.pages[page.id].variants[slot.id];
    assert(resolved, "應解析出素材");
    frames.add(JSON.stringify(slot.frame));
  });
  assert(frames.size === 1, "框大小不一致");
  const frame = slot.frame;
  assert(frame.left + frame.width <= 100, "框超出右側範圍");
  assert(frame.bottom + frame.height <= 100, "框超出上方範圍");
});

test("天空角色使用飛行變體，非站姿", function () {
  const page = BOOK.pages.find((item) => item.id === "p2");
  const heroSlot = page.slots.find((slot) => slot.id === "hero");
  ["peter", "wendy", "boys"].forEach((stickerId) => {
    const placements = withSticker("p2", "hero", stickerId);
    const state = stateMachine.computeState(BOOK, placements);
    const resolved = state.pages.p2.variants.hero;
    assert(resolved.asset.indexOf("-flying.svg") !== -1, stickerId + " 未使用飛行變體：" + resolved.asset);
  });
  assert(heroSlot.role === "sky-flyer");
});

test("森林建造活動使用施工姿勢變體", function () {
  const placements = withSticker("p3", "helper", "boys");
  const state = stateMachine.computeState(BOOK, placements);
  const resolved = state.pages.p3.variants.helper;
  assert(resolved.asset.indexOf("boys-building.svg") !== -1, "未使用施工變體：" + resolved.asset);
});

test("缺少變體時回退到 default 且來源標記正確", function () {
  const page = BOOK.pages.find((item) => item.id === "p1");
  const slot = page.slots.find((item) => item.id === "visitor");
  const resolved = variantResolver.resolveAsset(BOOK, page, slot, "peter", {});
  assert(resolved.source === "default", "來源應為 default，實際 " + resolved.source);
  assert(resolved.asset === "assets/peter.svg", "應回退到預設素材");
});

test("規則以 priority 降序、ruleId 升序穩定排序", function () {
  const rules = ruleEvaluator.sortRules([
    { id: "b", priority: 10 },
    { id: "a", priority: 10 },
    { id: "c", priority: 20 }
  ]);
  assert(rules.map((rule) => rule.id).join(",") === "c,a,b", "排序錯誤");
});

test("JSON 順序不同時結果一致", function () {
  const shuffled = JSON.parse(JSON.stringify(BOOK));
  shuffled.rules.reverse();
  shuffled.pages.reverse();
  const placements = {
    p1: { visitor: "wendy", clue: "shadow" },
    p2: { hero: "peter", magic: "dust" },
    p3: { helper: "boys", result: "house" }
  };
  const a = stateMachine.computeState(BOOK, placements);
  const b = stateMachine.computeState(shuffled, placements);
  assert(deepEqual(a.trace, b.trace), "trace 不一致");
  assert(deepEqual(a.facts, b.facts), "facts 不一致");
});

test("空白頁面使用 fallback 事件且不崩潰", function () {
  const state = stateMachine.computeState(BOOK, {});
  BOOK.pages.forEach((page) => {
    assert(state.pages[page.id].eventId === "fallback", "應為 fallback");
    assert(state.pages[page.id].paragraphs.length > 0, "fallback 仍需有段落");
  });
});

test("事件種類至少 10 種且各頁皆有專屬事件", function () {
  const events = new Set();
  BOOK.pages.forEach((page) => {
    STICKER_IDS.forEach((first) => {
      STICKER_IDS.forEach((second) => {
        const placements = {};
        placements[page.id] = {};
        page.slots.forEach((slot, index) => {
          placements[page.id][slot.id] = index === 0 ? first : second;
        });
        events.add(stateMachine.computeState(BOOK, placements).pages[page.id].eventId);
      });
    });
  });
  assert(events.size >= 10, "事件種類不足：" + events.size);
});

test("跨頁因果：第一頁 shadowRecovered 影響第二頁", function () {
  const withShadow = {
    p1: { visitor: "wendy", clue: "shadow" },
    p2: { hero: "peter" }
  };
  const state = stateMachine.computeState(BOOK, withShadow);
  assert(state.facts.shadowRecovered === true, "事實未建立");
  assert(state.pages.p2.eventId === "fliesAfterShadow", "第二頁事件錯誤：" + state.pages.p2.eventId);
  const withoutShadow = {
    p1: { visitor: "wendy", clue: "dust" },
    p2: { hero: "peter" }
  };
  const state2 = stateMachine.computeState(BOOK, withoutShadow);
  assert(state2.facts.shadowRecovered === undefined, "事實殘留");
  assert(state2.pages.p2.eventId !== "fliesAfterShadow", "第二頁仍觸發舊事件");
});

test("改放後完全重算：無過期事實殘留", function () {
  const placements = {
    p1: { visitor: "wendy", clue: "shadow" },
    p2: { hero: "peter", magic: "dust" },
    p3: { helper: "boys", result: "house" }
  };
  const before = stateMachine.computeState(BOOK, placements);
  assert(before.facts.shadowRecovered === true, "初始事實缺失");
  placements.p1.clue = "dust";
  const after = stateMachine.computeState(BOOK, placements);
  assert(after.facts.shadowRecovered === undefined, "舊事實未清除");
  assert(after.pages.p2.eventId === "tookFlight", "重算後事件錯誤：" + after.pages.p2.eventId);
});

test("第三頁依賴第二頁事實（dust → forest）", function () {
  const withDust = {
    p2: { hero: "peter", magic: "dust" },
    p3: { helper: "boys" }
  };
  const state = stateMachine.computeState(BOOK, withDust);
  assert(state.facts.flewWithDust === true, "飛行事實缺失");
  assert(state.pages.p3.eventId === "forestWithDust", "第三頁事件錯誤：" + state.pages.p3.eventId);
});

test("移除放置後回到 fallback，無殘留事件", function () {
  const placements = { p1: { visitor: "wendy", clue: "shadow" } };
  const state = stateMachine.computeState(BOOK, placements);
  assert(state.pages.p1.eventId === "shadowRecovered", "第一頁事件錯誤");
  delete placements.p1.clue;
  const state2 = stateMachine.computeState(BOOK, placements);
  assert(state2.facts.shadowRecovered === undefined, "事實未清除");
  assert(state2.pages.p1.eventId !== "shadowRecovered", "舊事件仍觸發");
});

test("敘事段落沿用頁面段落 ID，token 可對應 slot", function () {
  const placements = { p2: { hero: "peter", magic: "dust" } };
  const state = stateMachine.computeState(BOOK, placements);
  const page = BOOK.pages.find((item) => item.id === "p2");
  const baseIds = page.paragraphs.map((paragraph) => paragraph.id);
  const variantIds = state.pages.p2.paragraphs.map((paragraph) => paragraph.id);
  assert(deepEqual(baseIds, variantIds), "段落 ID 不一致");
  const slotIds = page.slots.map((slot) => slot.id);
  state.pages.p2.paragraphs.forEach((paragraph) => {
    paragraph.parts.forEach((part) => {
      if (part.type === "slot") {
        assert(slotIds.indexOf(part.slotId) !== -1, "token 指向不存在的 slot");
      }
    });
  });
});

test("每頁至少有多個可達事件", function () {
  BOOK.pages.forEach((page) => {
    const seen = new Set();
    STICKER_IDS.forEach((first) => {
      STICKER_IDS.forEach((second) => {
        const placements = {};
        placements[page.id] = {};
        page.slots.forEach((slot, index) => {
          placements[page.id][slot.id] = index === 0 ? first : second;
        });
        seen.add(stateMachine.computeState(BOOK, placements).pages[page.id].eventId);
      });
    });
    assert(seen.size >= 3, page.id + " 可達事件過少：" + seen.size);
  });
});

/* ---------------- persistence ---------------- */

section("存檔相容（AC-010）");

function fakeStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    data: data,
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = String(value);
    },
    removeItem: function (key) {
      delete data[key];
    },
    keys: function () {
      return Object.keys(data);
    }
  };
}

const LEGACY_KEYS = [
  "moonforest-story-v1",
  "moonforest-story-chatgpt-v1",
  "storybook-peterpan-original-v1",
  "storybook-sticker-demo-v1"
];

test("新 key 與四個舊 key 完全隔離", function () {
  const storage = fakeStorage();
  LEGACY_KEYS.forEach(function (key) {
    storage.setItem(key, "legacy-value-" + key);
  });
  saveAdapter.save("peterpan-sticker-pilot", {
    pageIndex: 1,
    placements: { p1: { visitor: "wendy" } }
  }, storage);
  assert(
    storage.getItem("storybook-book-v1-peterpan-sticker-pilot") !== null,
    "新 key 未寫入"
  );
  LEGACY_KEYS.forEach(function (key) {
    assert(storage.getItem(key) === "legacy-value-" + key, "舊 key 被改動：" + key);
  });
});

test("清除只刪除新 key，舊 key 保留", function () {
  const storage = fakeStorage();
  LEGACY_KEYS.forEach(function (key) {
    storage.setItem(key, "legacy-" + key);
  });
  saveAdapter.save("peterpan-sticker-pilot", { pageIndex: 2, placements: {} }, storage);
  saveAdapter.clear("peterpan-sticker-pilot", storage);
  assert(storage.getItem("storybook-book-v1-peterpan-sticker-pilot") === null, "新 key 未清除");
  LEGACY_KEYS.forEach(function (key) {
    assert(storage.getItem(key) === "legacy-" + key, "舊 key 被刪除：" + key);
  });
});

test("存檔內容只含 pageIndex 與 placements，無衍生資料", function () {
  const storage = fakeStorage();
  saveAdapter.save("peterpan-sticker-pilot", {
    pageIndex: 0,
    placements: { p1: { visitor: "wendy" } },
    facts: { shadowRecovered: true },
    events: { p1: "shadowRecovered" },
    eventId: "shadowRecovered"
  }, storage);
  const raw = storage.getItem("storybook-book-v1-peterpan-sticker-pilot");
  assert(raw.indexOf("facts") === -1, "存檔含 facts：" + raw);
  assert(raw.indexOf("eventId") === -1, "存檔含 eventId：" + raw);
  const parsed = JSON.parse(raw);
  assert(deepEqual(Object.keys(parsed).sort(), ["pageIndex", "placements"]), "存檔欄位過多");
});

test("載入時清除非法 placement 值", function () {
  const storage = fakeStorage();
  storage.setItem(
    "storybook-book-v1-peterpan-sticker-pilot",
    JSON.stringify({
      pageIndex: -3,
      placements: {
        p1: { visitor: "wendy", clue: 42, extra: "" },
        p2: "not-an-object",
        p3: { slot: null }
      }
    })
  );
  const state = saveAdapter.load("peterpan-sticker-pilot", storage);
  assert(state.pageIndex === 0, "負數頁碼未修正：" + state.pageIndex);
  assert(deepEqual(state.placements.p1, { visitor: "wendy" }), "非法值未清除");
  assert(state.placements.p2 === undefined, "非法頁面未被丟棄");
  assert(state.placements.p3 === undefined, "空值頁面未被丟棄");
});

test("損毀的存檔不會讓讀取失敗", function () {
  const storage = fakeStorage();
  storage.setItem("storybook-book-v1-peterpan-sticker-pilot", "{not json");
  const state = saveAdapter.load("peterpan-sticker-pilot", storage);
  assert(deepEqual(state, { pageIndex: 0, placements: {} }), "損毀存檔未退回預設");
});

test("不同 bookId 使用不同 key", function () {
  assert(
    saveAdapter.storageKey("book-a") !== saveAdapter.storageKey("book-b"),
    "不同書共用同一 key"
  );
  assert(
    saveAdapter.storageKey("book-a").indexOf("storybook-book-v1-") === 0,
    "key 命名空間不符"
  );
});

/* ---------------- editor ZIP ---------------- */

section("編輯器 ZIP 匯出／匯入");

test("ZIP round-trip 保留檔名與內容", function () {
  const files = [
    { name: "book.json", data: JSON.stringify(BOOK) },
    { name: "assets/peter-flying.svg", data: "<svg xmlns='http://www.w3.org/2000/svg'/>" }
  ];
  const bytes = editorZip.write(files);
  const entries = editorZip.read(bytes);
  assert(entries.length === 2, "項目數量不符：" + entries.length);
  const byName = {};
  entries.forEach(function (entry) {
    byName[entry.name] = new TextDecoder().decode(entry.data);
  });
  assert(byName["book.json"] === JSON.stringify(BOOK), "book.json 內容不一致");
  assert(byName["assets/peter-flying.svg"].indexOf("<svg") === 0, "素材內容不一致");
});

test("ZIP 輸出為 stored（不壓縮），且 bytes 具決定性", function () {
  const files = [{ name: "book.json", data: "{}" }];
  const a = editorZip.write(files);
  const b = editorZip.write(files);
  assert(a.length === b.length, "相同輸入產生不同長度");
  assert(Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0, "相同輸入產生不同 bytes");
  const method = new DataView(a.buffer, a.byteOffset, a.byteLength).getUint16(8, true);
  assert(method === 0, "壓縮 method 應為 0（stored），實際為 " + method);
});

test("CRC32 對應已知向量", function () {
  assert(editorZip.crc32(new TextEncoder().encode("123456789")) === 0xcbf43926, "CRC32 錯誤");
});

test("損毀的 ZIP 會拋出明確錯誤", function () {
  let message = null;
  try {
    editorZip.read(new Uint8Array([1, 2, 3, 4]));
  } catch (error) {
    message = error.message;
  }
  assert(message !== null, "損毀 ZIP 未拋錯");
  assert(message.indexOf("ZIP") !== -1, "錯誤訊息不夠明確：" + message);
});

test("壓縮過的 ZIP 項目會被明確拒絕", function () {
  const bytes = editorZip.write([{ name: "book.json", data: "{}" }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 中央目錄起點由 EOCD 的 offset 欄位取得；compression method 欄位
  // 位於中央目錄起點 + 10。
  let centralStart = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      centralStart = view.getUint32(i + 16, true);
      break;
    }
  }
  assert(centralStart >= 0, "找不到中央目錄");
  view.setUint16(centralStart + 10, 8, true);
  let message = null;
  try {
    editorZip.read(bytes);
  } catch (error) {
    message = error.message;
  }
  assert(message !== null && message.indexOf("stored") !== -1, "未明確拒絕壓縮項目：" + message);
});

/* ---------------- summary ---------------- */

process.stdout.write("\n" + passed + " passed, " + failed + " failed\n");
if (failed > 0) {
  failures.forEach((failure) => {
    process.stdout.write("FAILED: " + failure.name + "\n");
  });
  process.exit(1);
}
process.exit(0);
