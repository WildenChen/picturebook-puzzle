#!/usr/bin/env node
/*
 * Real-browser check for the shared reader runtime.
 *
 *   node tests/browser-check.js [url]
 *
 * Drives the locally installed Google Chrome through the DevTools Protocol
 * (no extra npm dependency; Node's built-in WebSocket does the transport) and
 * asserts what only a real DOM can show: scene and sticker loading, fixed
 * slot frames, touch-style placement, cross-page causality, reload
 * persistence, storage-key isolation and a clean console.
 *
 * Screenshots are written to tests/artifacts/ as acceptance evidence.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(__dirname, "artifacts");
const TARGET_URL = process.argv[2] || "http://127.0.0.1:8765/reader-pilot.html";
const PORT = Number(process.env.PBP_CDP_PORT || 9333);

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEndpoint(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      /* not ready yet */
    }
    await delay(120);
  }
  throw new Error("CDP 端點逾時：" + url);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
        return;
      }
      this.listeners.forEach((listener) => listener(message));
    });
  }

  send(method, params) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve, reject: reject });
    });
  }

  on(listener) {
    this.listeners.push(listener);
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    socket.addEventListener("open", () => resolve(new CdpClient(socket)));
    socket.addEventListener("error", () => reject(new Error("WebSocket 連線失敗：" + wsUrl)));
  });
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    process.stdout.write("  ok   " + name + "\n");
  } else {
    failed += 1;
    failures.push(name);
    process.stdout.write("  FAIL " + name + (detail ? "\n         " + detail : "") + "\n");
  }
}

function section(title) {
  process.stdout.write("\n" + title + "\n");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression: expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error("頁面腳本錯誤：" + JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

const SELECT_STICKER = [
  "(function(){",
  "var chips=document.querySelectorAll('#stickerTray .sticker-chip');",
  "var target=null;",
  "chips.forEach(function(c){ if(c.dataset.stickerId===STICKER) target=c; });",
  "if(!target) return false;",
  "target.click();",
  "var slots=document.querySelectorAll('#stageActors .slot-box');",
  "if(!slots[SLOT]) return false;",
  "slots[SLOT].click();",
  "return true;",
  "})()"
].join("");

function placeScript(stickerId, slotIndex) {
  return SELECT_STICKER.split("STICKER").join(JSON.stringify(stickerId)).split("SLOT").join(String(slotIndex));
}

// Screenshot only the story stage, so the slot frames and the placed
// sticker variants are visible even when the stage is below the fold.
async function captureStage(client, fileName) {
  const box = await evaluate(
    client,
    "(function(){var el=document.getElementById('stage');if(!el) return null;" +
      "var r=el.getBoundingClientRect();" +
      "return {x:r.left+window.scrollX,y:r.top+window.scrollY,width:r.width,height:r.height};})()"
  );
  if (!box || !box.width || !box.height) {
    throw new Error("找不到 stage 元素，無法截圖：" + fileName);
  }
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      scale: 1
    }
  });
  const filePath = path.join(ARTIFACTS, fileName);
  fs.writeFileSync(filePath, Buffer.from(shot.data, "base64"));
  process.stdout.write("  截圖：" + filePath + "\n");
  return filePath;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    process.stdout.write("找不到 Chrome／Chromium／Edge，無法執行瀏覽器檢查\n");
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbp-chrome-"));

  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--window-size=1440,900",
      "--user-data-dir=" + profileDir,
      "--remote-debugging-port=" + PORT,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  const cleanup = () => {
    try {
      child.kill("SIGTERM");
    } catch (error) {
      /* ignore */
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (error) {
      /* ignore */
    }
  };

  let client;
  try {
    const version = await waitForEndpoint("http://127.0.0.1:" + PORT + "/json/version", 15000);
    process.stdout.write("瀏覽器：" + version.Browser + "\n目標頁：" + TARGET_URL + "\n");

    const targets = await waitForEndpoint("http://127.0.0.1:" + PORT + "/json/list", 10000);
    const page = targets.find((item) => item.type === "page");
    if (!page) throw new Error("找不到可用的 page target");
    client = await connect(page.webSocketDebuggerUrl);

    const consoleErrors = [];
    const failedRequests = [];
    client.on((message) => {
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        consoleErrors.push(
          (message.params.args || [])
            .map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description || ""))
            .join(" ")
        );
      }
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails || {};
        consoleErrors.push(details.text || "exception");
      }
      if (message.method === "Network.loadingFailed") {
        failedRequests.push(message.params.errorText || "loading failed");
      }
    });

    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: TARGET_URL });

    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      await delay(150);
      const probe = await evaluate(client, "!!document.querySelector('#stickerTray .sticker-chip')");
      if (probe === true) {
        ready = true;
        break;
      }
    }
    check("閱讀器完成初始化", ready, "貼紙列未渲染");
    if (!ready) throw new Error("閱讀器未初始化，後續檢查略過");

    const snapshot = await evaluate(client, "window.__pbpSnapshot()");

    section("載入與場景（AC-001）");
    check("三個章節按鈕存在", snapshot.chapterButtons === 3, "實際 " + snapshot.chapterButtons);
    check("六張貼紙載入", snapshot.stickerChips === 6, "實際 " + snapshot.stickerChips);
    check("場景圖片已載入", snapshot.sceneLoaded === true, snapshot.sceneSrc);
    check("所有貼紙圖片皆載入成功", snapshot.stickerImagesLoaded === 6, "實際 " + snapshot.stickerImagesLoaded);
    check("第一頁兩個放置框存在", snapshot.slotBoxes === 2, "實際 " + snapshot.slotBoxes);
    check("無 console 錯誤", consoleErrors.length === 0, consoleErrors.join(" | "));
    check("無失敗的網路請求", failedRequests.length === 0, failedRequests.join(" | "));

    section("放置框尺寸一致性（AC-003）");
    const framesBefore = JSON.stringify(snapshot.frames);
    check(
      "放置框固定且位於場景範圍內",
      snapshot.frames.length === 2 &&
        snapshot.frames.every(
          (frame) =>
            frame.left >= 0 &&
            frame.bottom >= 0 &&
            frame.left + frame.width <= 100.01 &&
            frame.bottom + frame.height <= 100.01
        ),
      framesBefore
    );

    section("觸控式放置與事件（AC-005 / AC-007）");
    const placed = await evaluate(client, placeScript("wendy", 0));
    check("可選取貼紙並放入第一個位置", placed === true);

    const afterWendy = await evaluate(client, "window.__pbpSnapshot()");
    check(
      "放入後貼紙出現在放置框內",
      afterWendy.filledSlots === 1 && afterWendy.slotImages === 1,
      "filled=" + afterWendy.filledSlots + " imgs=" + afterWendy.slotImages
    );
    check(
      "放置後放置框尺寸與位置完全不變",
      JSON.stringify(afterWendy.frames) === framesBefore,
      JSON.stringify(afterWendy.frames)
    );
    check(
      "正文 token 顯示已放入的貼紙名稱",
      afterWendy.storyText.indexOf("溫蒂") !== -1,
      afterWendy.storyText
    );

    await evaluate(client, placeScript("shadow", 1));
    const afterShadow = await evaluate(client, "window.__pbpSnapshot()");
    check(
      "影子放入線索位置後觸發 shadowRecovered",
      afterShadow.eventId === "shadowRecovered",
      "eventId=" + afterShadow.eventId
    );
    check(
      "影子位置使用情境變體 shadow-floor.svg",
      afterShadow.slotImageSrcs.some((src) => src.indexOf("shadow-floor.svg") !== -1),
      afterShadow.slotImageSrcs.join(",")
    );

    section("跨頁因果（AC-006）");
    await evaluate(client, "document.getElementById('nextPage').click()");
    await evaluate(client, placeScript("peter", 0));
    const page2 = await evaluate(client, "window.__pbpSnapshot()");
    check(
      "第二頁因第一頁 shadowRecovered 而觸發 fliesAfterShadow",
      page2.eventId === "fliesAfterShadow",
      "eventId=" + page2.eventId
    );
    check(
      "天空位置使用飛行變體",
      page2.slotImageSrcs.some((src) => src.indexOf("-flying.svg") !== -1),
      page2.slotImageSrcs.join(",")
    );

    await evaluate(client, "document.querySelectorAll('.chapter-nav button')[0].click()");
    await evaluate(client, placeScript("dust", 1));
    await evaluate(client, "document.querySelectorAll('.chapter-nav button')[1].click()");
    const changedBack = await evaluate(client, "window.__pbpSnapshot()");
    check(
      "改放第一頁後第二頁事件被完全重算",
      changedBack.eventId !== "fliesAfterShadow",
      "eventId=" + changedBack.eventId
    );
    check(
      "已失效事實不殘留",
      changedBack.facts.shadowRecovered === undefined,
      JSON.stringify(changedBack.facts)
    );

    section("存檔相容（AC-010）");
    const storage = await evaluate(client, "window.__pbpStorageSnapshot()");
    check(
      "只使用新的版本化 storage key",
      storage.pilotKey === "storybook-book-v1-peterpan-sticker-pilot",
      JSON.stringify(storage)
    );
    check(
      "未觸碰既有 localStorage key",
      storage.legacyKeys.every((entry) => entry.value === null),
      JSON.stringify(storage.legacyKeys)
    );
    check(
      "存檔內容不含衍生 facts 或 events",
      storage.raw.indexOf("facts") === -1 && storage.raw.indexOf("eventId") === -1,
      storage.raw
    );

    await client.send("Page.reload", {});
    await delay(1600);
    const afterReload = await evaluate(client, "window.__pbpSnapshot()");
    check(
      "重新整理後放置結果與頁碼保留",
      afterReload.filledSlots >= 1 && afterReload.pageIndex === 1,
      "filled=" + afterReload.filledSlots + " pageIndex=" + afterReload.pageIndex
    );

    const cleared = await evaluate(
      client,
      "(function(){document.getElementById('resetBook').click();return window.__pbpStorageSnapshot();})()"
    );
    check(
      "清除進度只刪除新 key",
      cleared.pilotValue === null && cleared.legacyKeys.every((entry) => entry.value === null),
      JSON.stringify(cleared)
    );

    section("截圖證據");
    await evaluate(client, "document.querySelectorAll('.chapter-nav button')[0].click()");
    await evaluate(client, placeScript("wendy", 0));
    await evaluate(client, placeScript("shadow", 1));
    await evaluate(client, "document.querySelectorAll('.chapter-nav button')[1].click()");
    await evaluate(client, placeScript("peter", 0));
    await delay(500);
    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(ARTIFACTS, "reader-pilot-page2.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    process.stdout.write("  截圖：" + shotPath + "\n");

    // AC-005 asks for at least three key frames: the room scene with the
    // shadow clue, the sky scene with the flying variant, and the forest
    // scene with the building variant.
    await evaluate(client, "document.querySelectorAll('.chapter-nav button')[0].click()");
    await evaluate(client, placeScript("shadow", 1));
    await delay(400);
    await captureStage(client, "reader-pilot-page1-room.png");

    await evaluate(client, "document.querySelectorAll('.chapter-nav button')[2].click()");
    await evaluate(client, placeScript("boys", 0));
    await evaluate(client, placeScript("house", 1));
    await delay(400);
    await captureStage(client, "reader-pilot-page3-forest.png");
    const forestState = await evaluate(client, "window.__pbpSnapshot()");
    check(
      "森林頁使用施工姿勢變體（迷失男孩）",
      forestState.slotImageSrcs.some((src) => src.indexOf("boys-building.svg") !== -1),
      forestState.slotImageSrcs.join(",")
    );

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await delay(600);
    const mobileShot = await client.send("Page.captureScreenshot", { format: "png" });
    const mobilePath = path.join(ARTIFACTS, "reader-pilot-mobile.png");
    fs.writeFileSync(mobilePath, Buffer.from(mobileShot.data, "base64"));
    process.stdout.write("  截圖：" + mobilePath + "\n");
    await client.send("Emulation.clearDeviceMetricsOverride");
  } finally {
    if (client) {
      try {
        client.socket.close();
      } catch (error) {
        /* ignore */
      }
    }
    cleanup();
  }

  process.stdout.write("\n" + passed + " passed, " + failed + " failed\n");
  if (failed > 0) {
    failures.forEach((name) => process.stdout.write("FAILED: " + name + "\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\n");
  process.exit(1);
});
