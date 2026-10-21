#!/usr/bin/env node
/*
 * Real-browser check for the local authoring tool (AC-008 / AC-009 / AC-012).
 *
 *   node tests/editor-check.js [url]
 *
 * Drives the locally installed Google Chrome through the DevTools Protocol
 * (no extra npm dependency) and asserts what only a real DOM can show:
 * import -> edit prompt -> move a slot frame -> switch a variant -> live
 * preview -> export -> re-import in a fresh session -> identical checksum.
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
const TARGET_URL = process.argv[2] || "http://127.0.0.1:8791/editor.html";
const PORT = Number(process.env.PBP_EDITOR_CDP_PORT || 9334);

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

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    process.stdout.write("找不到 Chrome／Chromium／Edge，無法執行編輯器檢查\n");
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "pbp-editor-chrome-"));

  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--window-size=1500,1000",
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
      /* ignore */    }
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
      const probe = await evaluate(client, "!!document.querySelector('#slotFields .part')");
      if (probe === true) {
        ready = true;
        break;
      }
    }
    check("編輯器完成初始化", ready, "編輯表單未渲染");
    if (!ready) throw new Error("編輯器未初始化，後續檢查略過");

    section("載入與驗證（AC-002 / AC-009）");
    const initial = await evaluate(
      client,
      "(function(){var b=window.PbpEditor.getBook();return {status:document.getElementById('status').textContent,bookId:b.bookId,rights:b.source.rightsReview,pages:b.pages.length,slots:b.pages[0].slots.length,exportDisabled:document.getElementById('exportJson').disabled};})()"
    );
    check("載入第四本試作封包", initial.bookId === "peterpan-sticker-pilot", JSON.stringify(initial));
    check("權利審核狀態顯示為 pending", initial.rights === "pending", initial.rights);
    check("初始驗證通過且未阻擋匯出", initial.exportDisabled === false, initial.status);
    check("三個頁面可編輯", initial.pages === 3, String(initial.pages));

    section("出版審核閘門（AC-009）");
    const rightsGate = await evaluate(
      client,
      `(function(){
        var state = document.getElementById('publicationState').textContent;
        var rows = document.querySelectorAll('#rightsTable .rights-row');
        var pending = document.querySelectorAll('#rightsTable .rights-pending').length;
        var badges = Array.prototype.map.call(document.querySelectorAll('#rightsTable .rights-badge'), function(b){return b.textContent;});
        return {
          state: state,
          stateClass: document.getElementById('publicationState').className,
          rowCount: rows.length,
          pending: pending,
          badges: badges.slice(0, 3),
          hasApproved: badges.indexOf('已核准') !== -1
        };
      })()`
    );
    check(
      "預設封包顯示未核准可發布",
      rightsGate.state.indexOf("未核准可發布") !== -1,
      rightsGate.state
    );
    check(
      "審核狀態以警示樣式呈現",
      rightsGate.stateClass.indexOf("is-warn") !== -1,
      rightsGate.stateClass
    );
    check(
      "列出書封層級與全部 17 項素材",
      rightsGate.rowCount === 18,
      String(rightsGate.rowCount)
    );
    check("18 項皆為待審", rightsGate.pending === 18, String(rightsGate.pending));
    check("未出現已核准標記", rightsGate.hasApproved === false, JSON.stringify(rightsGate.badges));

    section("編輯：提示詞／框位置／變體（AC-008）");
    const edited = await evaluate(
      client,
      `(function(){
        var b = window.PbpEditor.getBook();
        var page = b.pages[0];
        var slot = page.slots[0];
        slot.frame.left = 27.5;
        slot.hint['zh-Hant'] = '一位會飛的訪客';
        var sticker = b.stickers.find(function(s){return s.id === 'peter';});
        sticker.variants['sky-flyer'] = 'assets/peter-flying.svg';
        var textarea = document.querySelector('#paragraphFields textarea');
        textarea.value = '編輯器改寫的提示詞：';
        textarea.dispatchEvent(new Event('input', {bubbles:true}));
        window.PbpEditor.renderPreview();
        return {
          left: slot.frame.left,
          hint: slot.hint['zh-Hant'],
          variant: sticker.variants['sky-flyer'],
          dirty: document.getElementById('dirtyFlag').textContent,
          exportDisabled: document.getElementById('exportJson').disabled
        };
      })()`
    );
    check("修改框位置被保留", edited.left === 27.5, JSON.stringify(edited));
    check("修改提示詞被保留", edited.hint === "一位會飛的訪客", JSON.stringify(edited));
    check("切換變體被保留", edited.variant === "assets/peter-flying.svg", JSON.stringify(edited));
    check("標示為未匯出的修改", edited.dirty.indexOf("未匯出") !== -1, edited.dirty);

    const preview = await evaluate(
      client,
      "(function(){var boxes=document.querySelectorAll('#stageActors .slot-box');var b=boxes[0].getBoundingClientRect();var s=document.getElementById('previewScene').getBoundingClientRect();return {count:boxes.length,leftPct:Math.round(((b.left-s.left)/s.width)*10000)/100,text:document.getElementById('previewText').textContent.slice(0,40)};})()"
    );
    check("預覽反映新的框位置", Math.abs(preview.leftPct - 27.5) < 0.3, JSON.stringify(preview));
    check("預覽反映新的提示詞", preview.text.indexOf("編輯器改寫的提示詞") !== -1, preview.text);

    section("匯出與重新匯入（AC-008）");
    const exported = await evaluate(
      client,
      `(async function(){
        window.__pbpEditorExports = [];
        document.getElementById('exportJson').click();
        for (var i = 0; i < 100 && !window.__pbpEditorLastExport; i += 1) {
          await new Promise(function(r){setTimeout(r,50);});
        }
        return {
          export: window.__pbpEditorLastExport,
          dirty: document.getElementById('dirtyFlag').textContent,
          checksum: document.getElementById('checksum').textContent
        };
      })()`
    );
    const exportRecord = exported.export;
    check("匯出 JSON 產生 SHA-256 紀錄", !!(exportRecord && exportRecord.digest && exportRecord.digest.length === 64), JSON.stringify(exportRecord && exportRecord.digest));
    check(
      "待審封包匯出時 publishable 為 false",
      exportRecord && exportRecord.publishable === false,
      JSON.stringify(exportRecord && exportRecord.publishable)
    );
    check("匯出後標示為已與匯出檔一致", exported.dirty.indexOf("未匯出") === -1, exported.dirty);
    check("checksum 顯示於畫面", exported.checksum.indexOf("SHA-256") !== -1, exported.checksum);

    const zipExport = await evaluate(
      client,
      `(async function(){
        window.__pbpEditorLastExport = null;
        document.getElementById('exportZip').click();
        for (var i = 0; i < 100 && !window.__pbpEditorLastExport; i += 1) {
          await new Promise(function(r){setTimeout(r,50);});
        }
        return window.__pbpEditorLastExport;
      })()`
    );
    check("匯出 ZIP 成功", zipExport && zipExport.kind === "zip" && zipExport.bytes > 0, JSON.stringify(zipExport && zipExport.bytes));
    check("ZIP 包含素材檔（不只有 manifest）", zipExport && zipExport.entryCount > 2, JSON.stringify(zipExport && zipExport.entryCount));
    check(
      "待審封包 ZIP 匯出時 publishable 為 false",
      zipExport && zipExport.publishable === false,
      JSON.stringify(zipExport && zipExport.publishable)
    );

    // A fully approved package is the only state that may be labelled publishable.
    // The sample is a real file in the repository, not a hand-edited blob.
    const approvedGate = await evaluate(
      client,
      `(async function(){
        var response = await fetch('books/peterpan-sticker-pilot/approved-rights-sample.json');
        var sample = await response.text();
        await window.PbpEditor.importText(sample);
        var state = document.getElementById('publicationState').textContent;
        var rowCount = document.querySelectorAll('#rightsTable .rights-row').length;
        var approvedRows = document.querySelectorAll('#rightsTable .rights-approved').length;
        window.__pbpEditorLastExport = null;
        document.getElementById('exportJson').click();
        for (var i = 0; i < 100 && !window.__pbpEditorLastExport; i += 1) {
          await new Promise(function(r){setTimeout(r,50);});
        }
        return {
          state: state,
          stateClass: document.getElementById('publicationState').className,
          rowCount: rowCount,
          approvedRows: approvedRows,
          exportPublishable: window.__pbpEditorLastExport ? window.__pbpEditorLastExport.publishable : null,
          status: document.getElementById('status').textContent
        };
      })()`
    );
    check(
      "全部核准的封包顯示已核准可發布",
      approvedGate.state.indexOf("已核准可發布") !== -1,
      approvedGate.state
    );
    check(
      "已核准狀態以成功樣式呈現",
      approvedGate.stateClass.indexOf("is-ok") !== -1,
      approvedGate.stateClass
    );
    check("18 項全部標示為已核准", approvedGate.approvedRows === 18, String(approvedGate.approvedRows));
    check(
      "已核准封包匯出時 publishable 為 true",
      approvedGate.exportPublishable === true,
      String(approvedGate.exportPublishable)
    );
    check(
      "已核准匯出狀態明示可發布",
      approvedGate.status.indexOf("已核准可發布") !== -1,
      approvedGate.status
    );

    // Approval without a named human reviewer must not count as publishable.
    const unsignedGate = await evaluate(
      client,
      `(async function(){
        var b = window.PbpEditor.getBook();
        var clone = JSON.parse(JSON.stringify(b));
        delete clone.source.rightsApprovedBy;
        delete clone.source.rightsApprovedAt;
        clone.source.translationCredit = '待指定';
        await window.PbpEditor.importText(JSON.stringify(clone));
        var state = document.getElementById('publicationState').textContent;
        var rowCount = document.querySelectorAll('#rightsTable .rights-row').length;
        var pendingRows = document.querySelectorAll('#rightsTable .rights-pending').length;
        return {
          state: state,
          rowCount: rowCount,
          pendingRows: pendingRows,
          stateClass: document.getElementById('publicationState').className
        };
      })()`
    );
    check(
      "缺人工簽認者時不得標示可發布",
      unsignedGate.state.indexOf("未核准可發布") !== -1,
      unsignedGate.state
    );
    check(
      "缺簽認者／簽認時間／譯者署名會逐項列出",
      unsignedGate.pendingRows === 3,
      String(unsignedGate.pendingRows)
    );
    check(
      "缺簽認者時表格共 21 列（18 項權利列 ＋ 3 項待補）",
      unsignedGate.rowCount === 21,
      String(unsignedGate.rowCount)
    );
    check(
      "缺簽認者時回到警示樣式",
      unsignedGate.stateClass.indexOf("is-warn") !== -1,
      unsignedGate.stateClass
    );

    // Restore the pending package for the remaining checks.
    await evaluate(
      client,
      `(async function(){
        var b = window.PbpEditor.getBook();
        var clone = JSON.parse(JSON.stringify(b));
        clone.source.rightsReview = 'pending';
        clone.source.draftOrigin = 'ai-generated';
        clone.assets.forEach(function(a){ a.rightsReview = 'pending'; });
        await window.PbpEditor.importText(JSON.stringify(clone));
        return true;
      })()`
    );

    // Fresh session: reload the editor and import the exported text again.
    await client.send("Page.reload", {});
    await delay(1500);
    const reimport = await evaluate(
      client,
      `(async function(){
        var text = ${JSON.stringify(exportRecord.text)};
        await window.PbpEditor.importText(text);
        var b = window.PbpEditor.getBook();
        var digest = await (async function(){
          var bytes = new TextEncoder().encode(text);
          var d = await window.crypto.subtle.digest('SHA-256', bytes);
          return Array.prototype.map.call(new Uint8Array(d), function(x){return x.toString(16).padStart(2,'0');}).join('');
        })();
        return {
          digest: digest,
          expected: ${JSON.stringify(exportRecord.digest)},
          left: b.pages[0].slots[0].frame.left,
          hint: b.pages[0].slots[0].hint['zh-Hant'],
          variant: b.stickers.find(function(s){return s.id === 'peter';}).variants['sky-flyer'],
          status: document.getElementById('status').textContent
        };
      })()`
    );
    check(
      "重新匯入後 checksum 一致",
      reimport.digest === reimport.expected,
      reimport.digest + " vs " + reimport.expected
    );
    check("重新匯入後修改保留（框位置）", reimport.left === 27.5, String(reimport.left));
    check("重新匯入後修改保留（提示詞）", reimport.hint === "一位會飛的訪客", reimport.hint);
    check("重新匯入後修改保留（變體）", reimport.variant === "assets/peter-flying.svg", reimport.variant);
    check("重新匯入後驗證通過", reimport.status.indexOf("驗證通過") !== -1, reimport.status);

    section("拒絕無效封包（AC-002 / AC-012）");
    const rejected = await evaluate(
      client,
      "(function(){var b=window.PbpEditor.getBook();var bad=JSON.parse(JSON.stringify(b));delete bad.pages[0].id;window.__badBook=bad;return true;})()"
    );
    check("可產生無效封包供匯入測試", rejected === true);
    const invalidImport = await evaluate(
      client,
      "(async function(){var text=JSON.stringify(window.__badBook);await window.PbpEditor.importText(text);var r=await window.PbpEditor.validate();return {errors:r.errors.length, firstError:r.errors[0]?r.errors[0].path:null, exportDisabled:document.getElementById('exportJson').disabled, exportZipDisabled:document.getElementById('exportZip').disabled, status:document.getElementById('status').textContent};})()"
    );
    check(
      "無效封包被驗證器擋下且匯出停用",
      invalidImport.errors > 0 &&
        invalidImport.exportDisabled === true &&
        invalidImport.exportZipDisabled === true,
      JSON.stringify(invalidImport)
    );
    check("UI 顯示驗證失敗訊息", invalidImport.status.indexOf("驗證未通過") !== -1, invalidImport.status);

    section("截圖證據");
    await client.send("Page.navigate", { url: TARGET_URL });
    await delay(1600);
    await evaluate(
      client,
      "(function(){var b=window.PbpEditor.getBook();b.pages[0].slots[0].frame.left=27.5;b.pages[0].slots[0].hint['zh-Hant']='一位會飛的訪客';window.PbpEditor.renderPreview();return true;})()"
    );
    await delay(400);
    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(ARTIFACTS, "editor-preview.png");
    fs.writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
    process.stdout.write("  截圖：" + shotPath + "\n");

    // Rights gate evidence: the pending package as the reviewer sees it.
    await evaluate(
      client,
      "(function(){var f=document.getElementById('rightsTable');if(f)f.scrollIntoView({block:'center'});return true;})()"
    );
    await delay(300);
    const rightsShot = await client.send("Page.captureScreenshot", { format: "png" });
    const rightsShotPath = path.join(ARTIFACTS, "editor-rights-gate.png");
    fs.writeFileSync(rightsShotPath, Buffer.from(rightsShot.data, "base64"));
    process.stdout.write("  截圖：" + rightsShotPath + "\n");
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
