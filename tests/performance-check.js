#!/usr/bin/env node
/*
 * Local performance baseline for AC-015.
 *
 *   node tests/performance-check.js [readerUrl] [editorUrl]
 *
 * This records observed measurements only. It does not invent a hard
 * millisecond threshold: the acceptance spec explicitly forbids fabricated
 * performance targets, so every number written out is a measured baseline
 * of this machine at this commit.
 *
 * Measured:
 *   - reader page load time (navigation -> book rendered)
 *   - sticker placement / event recompute latency
 *   - story recompute latency for a full-book state rebuild
 *   - book package size on disk
 *   - number of network requests during reading (must not include any
 *     external or model endpoint)
 *   - number of AI/model calls during reading (expected 0)
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(__dirname, "artifacts");
const READER_URL = process.argv[2] || "http://127.0.0.1:8791/reader-pilot.html";
const EDITOR_URL = process.argv[3] || "http://127.0.0.1:8791/editor.html";
const BOOK_PATH = path.join(ROOT, "books", "peterpan-sticker-pilot", "book.json");
const PORT = Number(process.env.PBP_CDP_PORT || 9335);

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

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const PLACE_SCRIPT = [
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
  return PLACE_SCRIPT.split("STICKER").join(JSON.stringify(stickerId)).split("SLOT").join(String(slotIndex));
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    process.stdout.write("找不到 Chrome／Chromium／Edge，無法執行效能基線\n");
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbp-perf-"));

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
  const baseline = {
    measuredAt: new Date().toISOString(),
    machine: process.platform + " " + process.arch + " node " + process.version,
    readerUrl: READER_URL
  };

  try {
    const version = await waitForEndpoint("http://127.0.0.1:" + PORT + "/json/version", 15000);
    process.stdout.write("瀏覽器：" + version.Browser + "\n");
    const targets = await waitForEndpoint("http://127.0.0.1:" + PORT + "/json/list", 10000);
    const page = targets.find((item) => item.type === "page");
    if (!page) throw new Error("找不到可用的 page target");
    client = await connect(page.webSocketDebuggerUrl);

    const requests = [];
    const failedRequests = [];
    client.on((message) => {
      if (message.method === "Network.requestWillBeSent") {
        requests.push(message.params.request.url);
      }
      if (message.method === "Network.loadingFailed") {
        failedRequests.push(message.params.errorText || "loading failed");
      }
    });

    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: READER_URL });

    section("閱讀器載入（AC-015）");
    const loadStart = Date.now();
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      await delay(25);
      const probe = await evaluate(client, "!!document.querySelector('#stickerTray .sticker-chip')");
      if (probe === true) {
        ready = true;
        break;
      }
    }
    const loadMs = Date.now() - loadStart;
    check("閱讀器完成初始化", ready === true, "耗時 " + loadMs + " ms");
    if (!ready) throw new Error("閱讀器未初始化");

    const navTiming = await evaluate(
      client,
      "(function(){var n=performance.getEntriesByType('navigation')[0];" +
        "if(!n) return null;" +
        "return {domContentLoaded:n.domContentLoadedEventEnd,loadEvent:n.loadEventEnd," +
        "responseEnd:n.responseEnd,transferSize:n.transferSize||0};})()"
    );
    baseline.readerLoad = {
      measuredWallClockMs: loadMs,
      navigation: navTiming
    };
    process.stdout.write(
      "  載入基線：wall clock " + loadMs + " ms｜DOMContentLoaded " +
        (navTiming ? round(navTiming.domContentLoaded) : "n/a") + " ms\n"
    );

    section("互動延遲（AC-015）");
    const placeLatencies = [];
    const pairs = [
      ["wendy", 0],
      ["shadow", 1],
      ["peter", 0],
      ["dust", 1],
      ["boys", 0],
      ["house", 1]
    ];
    for (const pair of pairs) {
      const before = Date.now();
      const ok = await evaluate(client, placeScript(pair[0], pair[1]));
      await evaluate(client, "window.__pbpSnapshot()");
      placeLatencies.push(Date.now() - before);
      if (!ok) {
        failed += 1;
        failures.push("貼紙放置失敗：" + pair[0]);
        process.stdout.write("  FAIL 貼紙放置失敗：" + pair[0] + "\n");
      }
    }
    baseline.placementLatencyMs = {
      samples: placeLatencies,
      median: round(median(placeLatencies)),
      max: round(Math.max.apply(null, placeLatencies))
    };
    check(
      "貼紙放置與事件重算皆完成",
      placeLatencies.length === pairs.length,
      "median " + baseline.placementLatencyMs.median + " ms｜max " + baseline.placementLatencyMs.max + " ms"
    );

    const recompute = await evaluate(
      client,
      "(async function(){var book=await (await fetch('./books/peterpan-sticker-pilot/book.json')).json();" +
        "var placements={p1:{visitor:'wendy',clue:'shadow'},p2:{hero:'peter',magic:'dust'},p3:{helper:'boys',result:'house'}};" +
        "var t0=performance.now();" +
        "for(var i=0;i<200;i++){StateMachine.computeState(book,placements);}" +
        "return performance.now()-t0;})()"
    );
    baseline.stateRecomputeMs = {
      iterations: 200,
      totalMs: round(recompute),
      perCallMs: round(recompute / 200)
    };
    process.stdout.write(
      "  狀態重算基線：200 次共 " + round(recompute) + " ms（每次 " + round(recompute / 200) + " ms）\n"
    );

    section("網路與模型呼叫（AC-015）");
    const external = requests.filter(
      (url) =>
        !url.startsWith("http://127.0.0.1") &&
        !url.startsWith("http://localhost") &&
        !url.startsWith("data:") &&
        !url.startsWith("blob:")
    );
    const modelCalls = requests.filter((url) =>
      /api|model|openai|anthropic|gemini|inference|generate/i.test(url)
    );
    baseline.network = {
      totalRequests: requests.length,
      externalRequests: external,
      modelLikeRequests: modelCalls
    };
    check("閱讀期間無外部請求", external.length === 0, external.join(" | "));
    check("閱讀期間無模型／AI 端點呼叫", modelCalls.length === 0, modelCalls.join(" | "));
    check("無失敗的網路請求", failedRequests.length === 0, failedRequests.join(" | "));
    process.stdout.write("  閱讀期間網路請求數：" + requests.length + "（全部本機靜態資源）\n");

    section("封包大小（AC-015）");
    const bookStat = fs.statSync(BOOK_PATH);
    const assetDir = path.join(path.dirname(BOOK_PATH), "assets");
    const assetNames = fs.readdirSync(assetDir);
    const assetBytes = assetNames.reduce(
      (total, name) => total + fs.statSync(path.join(assetDir, name)).size,
      0
    );
    baseline.package = {
      bookJsonBytes: bookStat.size,
      assetBytes: assetBytes,
      totalBytes: bookStat.size + assetBytes,
      assetCount: assetNames.length
    };
    check(
      "封包大小已記錄",
      baseline.package.totalBytes > 0,
      "book.json " + bookStat.size + " B｜素材 " + assetBytes + " B｜合計 " +
        (bookStat.size + assetBytes) + " B"
    );

    section("編輯器草稿輸出（AC-015）");
    await client.send("Page.navigate", { url: EDITOR_URL });
    let editorReady = false;
    for (let i = 0; i < 80; i += 1) {
      await delay(100);
      const probe = await evaluate(client, "!!window.__pbpEditor");
      if (probe === true) {
        editorReady = true;
        break;
      }
    }
    check("編輯器完成初始化", editorReady === true);
    if (editorReady) {
      const exportStart = Date.now();
      const exported = await evaluate(
        client,
        "(async function(){var t=window.__pbpEditor;" +
          "var text=await (await fetch('./books/peterpan-sticker-pilot/book.json')).text();" +
          "await t.importText(text);" +
          "var res=await t.validate();" +
          "if(!res||res.errors.length) return {ok:false,errors:res?res.errors:['no result']};" +
          "document.getElementById('exportZip').click();" +
          "var rec=null;" +
          "for(var i=0;i<200;i++){rec=window.__pbpEditorLastExport;if(rec) break;" +
          "await new Promise(function(r){setTimeout(r,25);});}" +
          "return {ok:Boolean(rec),zipBytes:rec?rec.bytes:0,entryCount:rec?rec.entryCount:0};})()"
      );
      const exportMs = Date.now() - exportStart;
      baseline.editor = {
        importAndExportMs: exportMs,
        exportZipBytes: exported && exported.zipBytes ? exported.zipBytes : 0,
        entryCount: exported && exported.entryCount ? exported.entryCount : 0,
        ok: Boolean(exported && exported.ok)
      };
      check(
        "編輯器匯入與 ZIP 輸出完成",
        Boolean(exported && exported.ok) && baseline.editor.exportZipBytes > 0,
        "耗時 " + exportMs + " ms｜ZIP " + baseline.editor.exportZipBytes + " B"
      );
    }

    const outPath = path.join(ARTIFACTS, "performance-baseline.json");
    fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
    process.stdout.write("\n基線寫入：" + outPath + "\n");
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
