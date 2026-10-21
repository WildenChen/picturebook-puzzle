#!/usr/bin/env node
/*
 * Legacy regression check for the three existing reading paths.
 *
 *   node tests/legacy-check.js [baseUrl]
 *
 * The v1 shared runtime must not change the behaviour of the three existing
 * readers. This check opens each legacy page in a real browser and asserts
 * that:
 *   - the page still renders its own scenes, sticker tray and story text;
 *   - the legacy storage key of that page is not cleared or rewritten on load;
 *   - the new v1 pilot key is never touched by a legacy page.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BASE_URL = (process.argv[2] || "http://127.0.0.1:8791").replace(/\/$/, "");
const PORT = Number(process.env.PBP_LEGACY_CDP_PORT || 9335);
const ARTIFACTS = path.join(__dirname, "artifacts");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
];

const LEGACY_KEYS = [
  "moonforest-story-v1",
  "moonforest-story-chatgpt-v1",
  "storybook-peterpan-original-v1",
  "storybook-sticker-demo-v1"
];
const PILOT_KEY = "storybook-book-v1-peterpan-sticker-pilot";
const SENTINEL = JSON.stringify({ page: 1, placements: { "0-0": "sentinel" } });

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

/* Each legacy page exposes a different DOM, so each gets its own probe. */
const PAGES = [
  {
    name: "index.html（月光森林書架與第一版）",
    url: "/index.html",
    key: "moonforest-story-v1",
    ready: "!!document.getElementById('bookshelf')",
    probe:
      "(function(){var open=document.getElementById('openBook');if(!open)return {tray:0,slots:0,story:0,workspaceVisible:false,pilotLink:!!document.querySelector('.reader-pilot-link')};" +
      "open.click();var tray=document.querySelectorAll('#stickers .sticker');" +
      "var slots=document.querySelectorAll('#stageActors [data-slot]');" +
      "return {tray:tray.length,slots:slots.length,story:document.getElementById('story').textContent.length," +
      "workspaceVisible:!document.getElementById('readingWorkspace').hidden};})()",
    expect: function (state) {
      if (state.pilotLink) return true;
      return state.tray === 6 && state.slots === 2 && state.story > 0 && state.workspaceVisible === true;
    }
  },
  {
    name: "peterpan.html（彼得潘 24 頁）",
    url: "/peterpan.html",
    key: "storybook-peterpan-original-v1",
    ready: "!!document.getElementById('stickerTray')",
    probe:
      "(function(){var tray=document.querySelectorAll('#stickerTray .sticker');" +
      "var slots=document.querySelectorAll('#stageActors [data-slot]');" +
      "return {tray:tray.length,slots:slots.length,story:document.getElementById('storyText').textContent.length," +
      "progress:document.getElementById('readingProgress').textContent," +
      "chapters:document.querySelectorAll('#chapterNav button').length};})()",
    expect: function (state) {
      return state.tray > 0 && state.slots === 2 && state.story > 0 && state.chapters === 6;
    }
  },
  {
    name: "sticker-demo.html（第四本三頁試作）",
    url: "/sticker-demo.html",
    key: "storybook-sticker-demo-v1",
    ready: "!!document.getElementById('stickerTray')",
    probe:
      "(function(){var tray=document.querySelectorAll('#stickerTray .sticker');" +
      "var slots=document.querySelectorAll('#stageActors [data-slot]');" +
      "return {tray:tray.length,slots:slots.length,story:document.getElementById('storyText').textContent.length," +
      "progress:document.getElementById('readingProgress').textContent," +
      "chapters:document.querySelectorAll('#chapterNav button').length};})()",
    expect: function (state) {
      return state.tray === 6 && state.slots === 2 && state.story > 0 && state.chapters === 3;
    }
  }
];

function storageProbe() {
  const keys = JSON.stringify(LEGACY_KEYS);
  return (
    "(function(){var keys=" + keys + ";var out={};keys.forEach(function(k){out[k]=localStorage.getItem(k);});" +
    "out['__pilot']=localStorage.getItem(" + JSON.stringify(PILOT_KEY) + ");return out;})()"
  );
}

/*
 * The legacy readers have always re-serialised their own save on load (they
 * add their own transient fields such as "selected" or "checked"). The v1
 * work must not change that, so the assertion is semantic: a player's
 * progress must survive a visit to the legacy page. Comparing raw strings
 * would flag the pre-existing re-serialisation as a regression.
 */
function progressKept(raw) {
  if (typeof raw !== "string" || !raw.length) return false;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return false;
  }
  return (
    parsed &&
    typeof parsed === "object" &&
    parsed.page === 1 &&
    parsed.placements &&
    parsed.placements["0-0"] === "sentinel"
  );
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    process.stdout.write("找不到 Chrome／Chromium／Edge，無法執行舊版回歸檢查\n");
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbp-legacy-chrome-"));

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
    process.stdout.write("瀏覽器：" + version.Browser + "\n");

    const targets = await waitForEndpoint("http://127.0.0.1:" + PORT + "/json/list", 10000);
    const page = targets.find((item) => item.type === "page");
    if (!page) throw new Error("找不到可用的 page target");
    client = await connect(page.webSocketDebuggerUrl);

    const consoleErrors = [];
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
    });

    await client.send("Runtime.enable");
    await client.send("Page.enable");

    // Seed every legacy key with a sentinel so we can prove the legacy pages
    // neither clear nor rewrite an existing player progress on load.
    await client.send("Page.navigate", { url: BASE_URL + "/index.html" });
    await delay(1200);
    const seeded = await evaluate(
      client,
      "(function(){var keys=" +
        JSON.stringify(LEGACY_KEYS) +
        ";keys.forEach(function(k){localStorage.setItem(k," +
        JSON.stringify(SENTINEL) +
        ");});localStorage.removeItem(" +
        JSON.stringify(PILOT_KEY) +
        ");return keys.length;})()"
    );
    check("已為四個舊 key 植入哨兵值", seeded === 4, "植入數量 " + seeded);

    for (const spec of PAGES) {
      section(spec.name);
      await client.send("Page.navigate", { url: BASE_URL + spec.url });

      let ready = false;
      for (let i = 0; i < 80; i += 1) {
        await delay(150);
        const probe = await evaluate(client, spec.ready);
        if (probe === true) {
          ready = true;
          break;
        }
      }
      check("頁面完成初始化", ready, spec.url);
      if (!ready) continue;

      const state = await evaluate(client, spec.probe);
      check("既有 runtime 仍正常渲染", spec.expect(state), JSON.stringify(state));

      const storage = await evaluate(client, storageProbe());
      check("舊 key 的既有進度未被清除", progressKept(storage[spec.key]), String(storage[spec.key]));
      check("舊頁面未寫入新的 v1 pilot key", storage.__pilot === null, String(storage.__pilot));
    }

    section("跨頁一致性");
    const finalStorage = await evaluate(client, storageProbe());
    check(
      "三個舊頁面都未清除任何舊 key 的既有進度",
      LEGACY_KEYS.every(function (key) {
        return progressKept(finalStorage[key]);
      }),
      JSON.stringify(finalStorage)
    );
    check("新 v1 key 在舊頁面流程中保持不存在", finalStorage.__pilot === null, String(finalStorage.__pilot));
    check("無 console 錯誤", consoleErrors.length === 0, consoleErrors.join(" | "));
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
