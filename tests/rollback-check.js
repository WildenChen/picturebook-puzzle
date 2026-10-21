#!/usr/bin/env node
/*
 * Rollback comparison for AC-014.
 *
 *   node tests/rollback-check.js [currentUrl] [baselineUrl]
 *
 * The current branch and the pre-change baseline commit are served side by
 * side from this machine, on ONE origin (tests/rollback-server.js mounts the
 * baseline at /baseline/). Same origin is required because localStorage is
 * origin-scoped: across two ports the storage comparison would prove
 * nothing. The check proves that:
 *   - the baseline (pre-change) static site still renders its legacy pages;
 *   - a reading progress written by the current build is still readable and
 *     is not destroyed by the baseline build;
 *   - the baseline build never writes or removes the new v1 storage key.
 *
 * Nothing here touches a published site: the server is local.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CURRENT_URL = (process.argv[2] || "http://127.0.0.1:8792").replace(/\/$/, "");
const BASELINE_URL = (process.argv[3] || CURRENT_URL + "/baseline").replace(/\/$/, "");
const PORT = Number(process.env.PBP_ROLLBACK_CDP_PORT || 9337);
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
    process.stdout.write("  ok   " + name + (detail ? "  " + detail : "") + "\n");
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

const LEGACY_PAGES = [
  {
    name: "index.html",
    url: "/index.html",
    ready: "!!document.getElementById('openBook')",
    probe:
      "(function(){var open=document.getElementById('openBook');if(!open)return {error:'no openBook'};" +
      "open.click();return {tray:document.querySelectorAll('#stickers .sticker').length," +
      "slots:document.querySelectorAll('#stageActors [data-slot]').length," +
      "story:document.getElementById('story').textContent.length};})()",
    expect: function (state) {
      return state.tray === 6 && state.slots === 2 && state.story > 0;
    }
  },
  {
    name: "peterpan.html",
    url: "/peterpan.html",
    ready: "!!document.getElementById('stickerTray')",
    probe:
      "(function(){return {tray:document.querySelectorAll('#stickerTray .sticker').length," +
      "slots:document.querySelectorAll('#stageActors [data-slot]').length," +
      "story:document.getElementById('storyText').textContent.length," +
      "chapters:document.querySelectorAll('#chapterNav button').length};})()",
    expect: function (state) {
      return state.tray > 0 && state.slots === 2 && state.story > 0 && state.chapters === 6;
    }
  },
  {
    name: "sticker-demo.html",
    url: "/sticker-demo.html",
    ready: "!!document.getElementById('stickerTray')",
    probe:
      "(function(){return {tray:document.querySelectorAll('#stickerTray .sticker').length," +
      "slots:document.querySelectorAll('#stageActors [data-slot]').length," +
      "story:document.getElementById('storyText').textContent.length," +
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
    "out.__pilot=localStorage.getItem(" + JSON.stringify(PILOT_KEY) + ");" +
    "out.__keys=Object.keys(localStorage).sort();return out;})()"
  );
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    process.stdout.write("找不到 Chrome／Chromium／Edge，無法執行回滾對照\n");
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbp-rollback-"));

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
    process.stdout.write("現行版：" + CURRENT_URL + "｜基準版：" + BASELINE_URL + "\n");
    check(
      "現行版與基準版同源（localStorage 隔離前提）",
      new URL(CURRENT_URL).origin === new URL(BASELINE_URL).origin,
      new URL(CURRENT_URL).origin + " vs " + new URL(BASELINE_URL).origin
    );

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
    });

    await client.send("Runtime.enable");
    await client.send("Page.enable");

    section("基準版（提交前 SHA）仍可讀");
    for (const spec of LEGACY_PAGES) {
      await client.send("Page.navigate", { url: BASELINE_URL + spec.url });
      let ready = false;
      for (let i = 0; i < 80; i += 1) {
        await delay(150);
        const probe = await evaluate(client, spec.ready);
        if (probe === true) {
          ready = true;
          break;
        }
      }
      check(spec.name + " 於基準版可正常渲染", ready === true);
      if (!ready) continue;
      const state = await evaluate(client, spec.probe);
      check(spec.name + " 內容完整", spec.expect(state), JSON.stringify(state));
    }

    section("現行版寫入的進度");
    await client.send("Page.navigate", { url: CURRENT_URL + "/reader-pilot.html" });
    let readerReady = false;
    for (let i = 0; i < 80; i += 1) {
      await delay(150);
      const probe = await evaluate(client, "!!document.querySelector('#stickerTray .sticker-chip')");
      if (probe === true) {
        readerReady = true;
        break;
      }
    }
    check("現行版共用閱讀器可載入", readerReady === true);
    if (!readerReady) throw new Error("現行版閱讀器未初始化");

    const placed = await evaluate(
      client,
      "(function(){var chips=document.querySelectorAll('#stickerTray .sticker-chip');" +
        "var t=null;chips.forEach(function(c){if(c.dataset.stickerId==='wendy')t=c;});" +
        "t.click();document.querySelectorAll('#stageActors .slot-box')[0].click();return true;})()"
    );
    check("現行版可放置貼紙並存檔", placed === true);
    const afterWrite = await evaluate(client, storageProbe());
    check(
      "現行版使用新的 v1 storage key",
      afterWrite.__pilot !== null,
      String(afterWrite.__pilot).slice(0, 120)
    );

    section("切回基準版（回滾演練）");
    await client.send("Page.navigate", { url: BASELINE_URL + "/index.html" });
    await delay(1500);
    const afterRollback = await evaluate(client, storageProbe());
    check(
      "基準版未刪除新 v1 storage key",
      afterRollback.__pilot !== null,
      String(afterRollback.__pilot).slice(0, 120)
    );
    check(
      "回滾後新 v1 進度內容與回滾前一致",
      afterRollback.__pilot === afterWrite.__pilot,
      "before=" + String(afterWrite.__pilot) + " after=" + String(afterRollback.__pilot)
    );
    check(
      "基準版沒有寫入任何新的 localStorage key",
      afterRollback.__keys.every(function (key) {
        return LEGACY_KEYS.indexOf(key) !== -1 || key === PILOT_KEY;
      }),
      afterRollback.__keys.join(",")
    );

    section("切回現行版（恢復演練）");
    await client.send("Page.navigate", { url: CURRENT_URL + "/reader-pilot.html" });
    await delay(1500);
    const restored = await evaluate(client, "window.__pbpSnapshot ? window.__pbpSnapshot() : null");
    check(
      "切回現行版後放置結果仍在",
      restored !== null && restored.filledSlots >= 1,
      restored ? "filled=" + restored.filledSlots : "snapshot 不可用"
    );
    const finalStorage = await evaluate(client, storageProbe());
    check(
      "回滾／恢復往返後新 v1 進度未被破壞",
      finalStorage.__pilot === afterWrite.__pilot,
      String(finalStorage.__pilot)
    );
    check("全程無 console 錯誤", consoleErrors.length === 0, consoleErrors.join(" | "));
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
