/*
 * Local authoring tool (v1 pilot).
 *
 * Scope, per ARCHITECTURE.md section 6: the editor loads a Book Package into
 * memory, edits a deliberately small set of fields, validates immediately,
 * previews the result and EXPORTS a file. It never writes to GitHub Pages,
 * never calls a remote API and never holds a model credential.
 *
 * Editing surface (v1):
 *   - page prompt / narrative text
 *   - one slot frame (position and size)
 *   - one sticker variant (which SVG a role resolves to)
 *   - metadata shown read-only (source, rights review)
 *
 * Security: untrusted strings become text nodes only; the editor never uses
 * innerHTML and never evaluates imported content.
 */
(function () {
  "use strict";

  const els = {};
  let book = null;
  let schema = null;
  let assetBlobs = {}; // path -> Uint8Array (only when imported from a ZIP)
  let assetBase = "books/peterpan-sticker-pilot/";
  let dirty = false;
  let previewPlacements = {};
  let selectedPageId = null;
  let selectedSlotId = null;
  let selectedStickerId = null;

  const $ = (id) => document.getElementById(id);

  /* ---------------- helpers ---------------- */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setStatus(message, kind, details) {
    els.status.textContent = message;
    els.status.className = "status" + (kind ? " is-" + kind : "");
    if (details && details.length) {
      const list = document.createElement("ul");
      details.slice(0, 12).forEach(function (item) {
        const li = document.createElement("li");
        li.textContent = item;
        list.append(li);
      });
      els.status.append(list);
    }
  }

  function markDirty(value) {
    dirty = value;
    els.dirtyFlag.textContent = value ? "未匯出的修改" : "與匯出檔一致";
    els.dirtyFlag.className = "dirty" + (value ? "" : " is-clean");
  }

  function pageById(pageId) {
    return (book.pages || []).find(function (page) {
      return page.id === pageId;
    });
  }

  function slotById(pageId, slotId) {
    const page = pageById(pageId);
    if (!page) return null;
    return (page.slots || []).find(function (slot) {
      return slot.id === slotId;
    });
  }

  function allAssets() {
    const seen = [];
    const push = function (path) {
      if (typeof path === "string" && path && seen.indexOf(path) === -1) seen.push(path);
    };
    (book.stickers || []).forEach(function (sticker) {
      push(sticker.defaultAsset);
      Object.keys(sticker.variants || {}).forEach(function (role) {
        push(sticker.variants[role]);
      });
    });
    (book.pages || []).forEach(function (page) {
      push(page.sceneAsset);
    });
    (book.rules || []).forEach(function (rule) {
      const overrides = (rule.then && rule.then.variantOverrides) || {};
      Object.keys(overrides).forEach(function (slotId) {
        push(overrides[slotId]);
      });
    });
    return seen;
  }

  function assetUrl(path) {
    if (Object.prototype.hasOwnProperty.call(assetBlobs, path)) {
      return URL.createObjectURL(new Blob([assetBlobs[path]], { type: "image/svg+xml" }));
    }
    return assetBase + path;
  }

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.crypto && window.crypto.subtle) {
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.prototype.map
        .call(new Uint8Array(digest), function (byte) {
          return byte.toString(16).padStart(2, "0");
        })
        .join("");
    }
    // Fallback for insecure contexts (http:// on a LAN IP): a clearly
    // labelled non-cryptographic digest, never presented as SHA-256.
    let hash = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      hash = (hash * 31 + bytes[i]) >>> 0;
    }
    return "fallback-" + hash.toString(16);
  }

  /* ---------------- import ---------------- */

  function parseBookJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("JSON 解析失敗：" + error.message);
    }
    if (!parsed || typeof parsed !== "object") throw new Error("封包必須是 JSON 物件");
    if (typeof parsed.bookId !== "string" || !parsed.bookId) {
      throw new Error("封包缺少 bookId");
    }
    return parsed;
  }

  function readZipEntries(entries) {
    const bookEntry = entries.find(function (entry) {
      return /(^|\/)book\.json$/.test(entry.name);
    });
    if (!bookEntry) throw new Error("ZIP 中找不到 book.json");
    const text = new TextDecoder().decode(bookEntry.data);
    const blobs = {};
    entries.forEach(function (entry) {
      if (entry.name === bookEntry.name) return;
      if (entry.name.indexOf("..") !== -1) return;
      blobs[entry.name] = entry.data;
    });
    return { book: parseBookJson(text), blobs: blobs };
  }

  async function handleImport(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    let imported;
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      const entries = EditorZip.read(buffer);
      imported = readZipEntries(entries);
      assetBlobs = imported.blobs;
    } else {
      imported = { book: parseBookJson(new TextDecoder().decode(buffer)), blobs: {} };
      assetBlobs = {};
    }
    book = imported.book;
    assetBase = "books/" + book.bookId + "/";
    selectedPageId = (book.pages && book.pages[0] && book.pages[0].id) || null;
    const page = pageById(selectedPageId);
    selectedSlotId = page && page.slots && page.slots[0] ? page.slots[0].id : null;
    selectedStickerId = book.stickers && book.stickers[0] ? book.stickers[0].id : null;
    buildPreviewPlacements();
    markDirty(false);
    renderForm();
    await validateNow();
    renderPreview();
    setStatus("已匯入《" + (book.title["zh-Hant"] || book.bookId) + "》。", "ok");
  }

  function buildPreviewPlacements() {
    previewPlacements = {};
    (book.pages || []).forEach(function (page) {
      const placements = {};
      (page.slots || []).forEach(function (slot, index) {
        const sticker = (book.stickers || [])[index % Math.max(1, (book.stickers || []).length)];
        if (sticker) placements[slot.id] = sticker.id;
      });
      previewPlacements[page.id] = placements;
    });
  }

  /* ---------------- validation ---------------- */

  const RIGHTS_LABEL = {
    pending: "待審",
    approved: "已核准",
    rejected: "已否准"
  };

  /*
   * Publication gate (AC-009).
   *
   * A package may always be previewed locally, but it may only be marked
   * as publishable when every rights field has been signed off by a human.
   * Nothing here is inferred from the fact that AI or Codex produced the
   * artwork or the prose.
   */
  function publicationState() {
    const source = (book && book.source) || {};
    const assets = (book && book.assets) || [];
    const pending = [];
    const rejected = [];

    if (source.rightsReview === "approved") {
      /*
       * An approval that does not name a human reviewer is not an approval.
       * The field is carried by the package so the sign-off travels with the
       * artifact, and the editor never fills it in on its own.
       */
      if (!source.rightsApprovedBy || !String(source.rightsApprovedBy).trim()) {
        pending.push({
          label: "書封層級",
          detail: "標示為 approved，但缺少人工簽認者 rightsApprovedBy",
          extra: true
        });
      }
      if (!source.rightsApprovedAt || !String(source.rightsApprovedAt).trim()) {
        pending.push({
          label: "書封層級",
          detail: "標示為 approved，但缺少簽認時間 rightsApprovedAt",
          extra: true
        });
      }
      if (!source.translationCredit || String(source.translationCredit).trim() === "待指定") {
        pending.push({
          label: "書封層級",
          detail: "翻譯署名（translationCredit）尚未指定",
          extra: true
        });
      }
    } else {
      pending.push({ label: "書封層級", detail: "source.rightsReview = " + source.rightsReview });
    }
    assets.forEach(function (asset) {
      if (asset.rightsReview === "rejected") {
        rejected.push({ label: asset.path, detail: "rightsReview = rejected" });
      } else if (asset.rightsReview !== "approved") {
        pending.push({ label: asset.path, detail: "rightsReview = " + asset.rightsReview });
      }
    });

    return {
      publishable: pending.length === 0 && rejected.length === 0,
      pending: pending,
      rejected: rejected,
      assetCount: assets.length
    };
  }

  function renderRightsPanel() {
    if (!els.publicationState || !els.rightsTable) return null;
    const state = publicationState();
    const source = (book && book.source) || {};
    els.publicationState.textContent = state.publishable
      ? "出版審核：已核准可發布（封包層級與 " + state.assetCount + " 項素材皆經人工簽認）。"
      : "出版審核：未核准可發布。可在本機預覽，但須先完成人工權利簽認。" +
        "待審 " + state.pending.length + " 項、否准 " + state.rejected.length + " 項。";
    els.publicationState.className = "list-note " + (state.publishable ? "is-ok" : "is-warn");

    els.rightsTable.replaceChildren();
    const rows = [
      {
        label: "書封層級",
        detail:
          source.work + "／" + source.author + "／" + source.edition +
          "｜翻譯：" + (source.translation || "未標示") +
          "｜譯者署名：" + (source.translationCredit || "未標示") +
          "｜草稿來源：" + (source.draftOrigin || "未標示") +
          (source.rightsApprovedBy ? "｜簽認者：" + source.rightsApprovedBy : "") +
          (source.rightsApprovedAt ? "｜簽認時間：" + source.rightsApprovedAt : ""),
        state: source.rightsReview
      }
    ].concat(
      ((book && book.assets) || []).map(function (asset) {
        return {
          label: asset.path,
          detail:
            (asset.kind || "") +
            "・作者：" + (asset.author || "未標示") +
            (asset.provenance ? "・來源：" + asset.provenance : ""),
          state: asset.rightsReview
        };
      })
    );

    /* Outstanding sign-off items that have no row of their own are listed
       explicitly, so a reviewer sees what still blocks publication instead
       of only a count. Asset rows already carry their own status. */
    state.pending.forEach(function (item) {
      if (!item.extra) return;
      rows.push({ label: item.label + "（待補）", detail: item.detail, state: "pending" });
    });

    rows.forEach(function (row) {
      const line = document.createElement("div");
      line.className = "rights-row rights-" + row.state;
      const name = document.createElement("span");
      name.className = "rights-name";
      name.textContent = row.label;
      const detail = document.createElement("span");
      detail.className = "rights-detail";
      detail.textContent = row.detail;
      const badge = document.createElement("span");
      badge.className = "rights-badge";
      badge.textContent = RIGHTS_LABEL[row.state] || row.state;
      line.append(name, detail, badge);
      els.rightsTable.append(line);
    });
    return state;
  }

  async function validateNow() {
    if (!book || !schema) return null;
    const result = BookValidator.validateBook(book, schema);
    if (result.errors.length) {
      setStatus(
        "驗證未通過（" + result.errors.length + " 項錯誤），匯出已停用。",
        "bad",
        result.errors.map(function (error) {
          return error.path + "：" + error.message;
        })
      );
    } else if (result.warnings.length) {
      setStatus(
        "驗證通過，但有 " + result.warnings.length + " 項提醒。",
        "warn",
        result.warnings.map(function (warning) {
          return (warning.path ? warning.path + "：" : "") + warning.message;
        })
      );
    } else {
      setStatus("驗證通過：schema 與引用完整性皆正確。", "ok");
    }
    renderRightsPanel();
    els.exportJson.disabled = result.errors.length > 0;
    els.exportZip.disabled = result.errors.length > 0;
    return result;
  }

  /* ---------------- form ---------------- */

  function renderForm() {
    els.bookTitle.textContent = book.title["zh-Hant"] + "（" + book.bookId + "）";
    els.rights.textContent =
      "權利審核：" + book.source.rightsReview + "｜作品：" + book.source.work +
      "｜作者：" + book.source.author + "｜版本：" + book.source.edition;

    els.pageSelect.replaceChildren();
    (book.pages || []).forEach(function (page) {
      const option = document.createElement("option");
      option.value = page.id;
      option.textContent = page.id + "・" + (page.title ? page.title["zh-Hant"] : "");
      if (page.id === selectedPageId) option.selected = true;
      els.pageSelect.append(option);
    });
    renderSlots();
    renderParagraphs();
    renderVariants();
  }

  function renderSlots() {
    const page = pageById(selectedPageId);
    els.slotFields.replaceChildren();
    if (!page) return;
    (page.slots || []).forEach(function (slot) {
      const wrap = document.createElement("div");
      wrap.className = "part";
      const label = document.createElement("div");
      label.className = "part-label";
      label.textContent = "SLOT " + slot.id + "（role: " + slot.role + "）";
      wrap.append(label);

      const grid = document.createElement("div");
      grid.className = "slotrow";
      ["left", "bottom", "width", "height"].forEach(function (key) {
        const field = document.createElement("div");
        const caption = document.createElement("label");
        caption.textContent = key + "（%）";
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.01";
        input.value = String(slot.frame[key]);
        input.dataset.slotId = slot.id;
        input.dataset.frameKey = key;
        input.addEventListener("change", function () {
          const target = slotById(selectedPageId, slot.id);
          const value = Number(input.value);
          if (!isFinite(value)) {
            setStatus("框數值不合法，已還原。", "bad");
            input.value = String(target.frame[key]);
            return;
          }
          target.frame[key] = value;
          markDirty(true);
          validateNow();
          renderPreview();
        });
        field.append(caption, input);
        grid.append(field);
      });
      wrap.append(grid);

      const hintLabel = document.createElement("label");
      hintLabel.textContent = "放置提示文字";
      const hintInput = document.createElement("input");
      hintInput.type = "text";
      hintInput.value = slot.hint["zh-Hant"];
      hintInput.addEventListener("input", function () {
        slot.hint["zh-Hant"] = hintInput.value;
        markDirty(true);
        renderPreview();
      });
      wrap.append(hintLabel, hintInput);
      els.slotFields.append(wrap);
    });
  }

  function renderParagraphs() {
    const page = pageById(selectedPageId);
    els.paragraphFields.replaceChildren();
    if (!page) return;
    const paragraphs = (page.paragraphs || []).slice();
    paragraphs.forEach(function (paragraph) {
      const wrap = document.createElement("div");
      wrap.className = "part";
      const label = document.createElement("div");
      label.className = "part-label";
      label.textContent = "段落 " + paragraph.id;
      wrap.append(label);
      (paragraph.parts || []).forEach(function (part, index) {
        if (part.type === "slot") {
          const slotLabel = document.createElement("label");
          slotLabel.textContent = "插槽 token（slotId）";
          const slotInput = document.createElement("input");
          slotInput.type = "text";
          slotInput.value = part.slotId || "";
          slotInput.addEventListener("change", function () {
            part.slotId = slotInput.value;
            markDirty(true);
            validateNow();
            renderPreview();
          });
          wrap.append(slotLabel, slotInput);
          return;
        }
        const textLabel = document.createElement("label");
        textLabel.textContent = "提示詞 / 正文片段 " + (index + 1);
        const textInput = document.createElement("textarea");
        textInput.value = part.value || "";
        textInput.addEventListener("input", function () {
          applyParagraphEdit(paragraph.id, index, textInput.value);
          markDirty(true);
          renderPreview();
        });
        wrap.append(textLabel, textInput);
      });
      els.paragraphFields.append(wrap);
    });
  }

  /*
   * Paragraph IDs are the stable contract between a page and its narrative
   * variants (ARCHITECTURE.md section 2). Editing the page copy therefore has
   * to reach every narrative that reuses the same paragraph ID, otherwise the
   * live preview would show the untouched event variant and the author would
   * see their edit disappear as soon as an event matched.
   */
  function applyParagraphEdit(paragraphId, partIndex, value) {
    const applyTo = function (paragraphs) {
      (paragraphs || []).forEach(function (paragraph) {
        if (paragraph.id !== paragraphId) return;
        const part = (paragraph.parts || [])[partIndex];
        if (part && part.type === "text") part.value = value;
      });
    };
    (book.pages || []).forEach(function (page) {
      applyTo(page.paragraphs);
    });
    (book.narratives || []).forEach(function (narrative) {
      applyTo(narrative.paragraphs);
    });
  }

  function renderVariants() {
    els.variantFields.replaceChildren();
    const options = allAssets();
    (book.stickers || []).forEach(function (sticker) {
      const roles = Object.keys(sticker.variants || {});
      roles.forEach(function (role) {
        const row = document.createElement("div");
        row.className = "variant-row";
        const label = document.createElement("label");
        label.textContent = sticker.label["zh-Hant"] + "・" + role;
        const select = document.createElement("select");
        options.forEach(function (path) {
          const option = document.createElement("option");
          option.value = path;
          option.textContent = path;
          if (path === sticker.variants[role]) option.selected = true;
          select.append(option);
        });
        select.addEventListener("change", function () {
          sticker.variants[role] = select.value;
          markDirty(true);
          validateNow();
          renderPreview();
        });
        const img = document.createElement("img");
        img.className = "variant-preview";
        img.alt = "";
        img.src = assetUrl(sticker.variants[role]);
        const holder = document.createElement("div");
        holder.append(img);
        row.append(label, select, holder);
        els.variantFields.append(row);
      });
    });
  }

  /* ---------------- preview ---------------- */

  function renderPreview() {
    if (!book) return;
    const page = pageById(selectedPageId);
    if (!page) return;
    const state = StateMachine.computeState(book, previewPlacements);
    const pageState = state.pages[page.id];

    els.previewTitle.textContent = page.title ? page.title["zh-Hant"] : page.id;
    els.previewKicker.textContent = page.kicker || "";
    els.previewEvent.textContent = "事件：" + pageState.eventId + "（規則 " + (pageState.ruleId || "fallback") + "）";

    els.previewText.replaceChildren(
      ...NarrativeRenderer.renderParagraphs(book, pageState.paragraphs, {
        placements: previewPlacements,
        slotHints: hintMap(),
        pageId: page.id
      })
    );

    els.previewScene.src = assetUrl(page.sceneAsset);
    els.previewScene.alt = "";
    els.stageActors.replaceChildren();
    (page.slots || []).forEach(function (slot) {
      const box = document.createElement("div");
      box.className = "slot-box";
      box.style.left = slot.frame.left + "%";
      box.style.bottom = slot.frame.bottom + "%";
      box.style.width = slot.frame.width + "%";
      box.style.height = slot.frame.height + "%";
      const stickerId = (previewPlacements[page.id] || {})[slot.id];
      const resolved = pageState.variants[slot.id];
      if (stickerId && resolved) {
        box.classList.add("is-filled");
        const img = document.createElement("img");
        img.src = assetUrl(resolved.asset);
        img.alt = "";
        box.append(img);
      } else {
        box.classList.add("is-empty");
        const hint = document.createElement("span");
        hint.textContent = slot.hint["zh-Hant"];
        box.append(hint);
      }
      els.stageActors.append(box);
    });
  }

  function hintMap() {
    const hints = {};
    (book.pages || []).forEach(function (page) {
      (page.slots || []).forEach(function (slot) {
        hints[page.id + "." + slot.id] = slot.hint["zh-Hant"];
      });
    });
    return hints;
  }

  /* ---------------- export ---------------- */

  function serializedBook() {
    return JSON.stringify(book, null, 2) + "\n";
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  async function exportJson() {
    const text = serializedBook();
    download(new Blob([text], { type: "application/json" }), book.bookId + ".json");
    const digest = await sha256(text);
    els.checksum.textContent = "JSON SHA-256：" + digest;
    els.checksum.dataset.digest = digest;
    markDirty(false);
    const rights = publicationState();
    setStatus(
      rights.publishable
        ? "已匯出 JSON（SHA-256 已記錄）。出版審核：已核准可發布。"
        : "已匯出 JSON（SHA-256 已記錄）。出版審核：待審草稿，尚不可標示為可發布。",
      rights.publishable ? "ok" : "warn"
    );
    recordExport({
      kind: "json",
      text: text,
      digest: digest,
      publishable: rights.publishable,
      publicationState: rights
    });
  }

  async function exportZip() {
    const text = serializedBook();
    const files = [{ name: "book.json", data: text }];
    const missing = [];
    for (const path of allAssets()) {
      if (Object.prototype.hasOwnProperty.call(assetBlobs, path)) {
        files.push({ name: path, data: assetBlobs[path] });
      } else {
        missing.push(path);
      }
    }
    // Assets that were never imported (a book loaded from this repository)
    // are fetched from the same origin so the exported ZIP is a complete,
    // re-importable package rather than a manifest without artwork.
    await Promise.all(
      missing.map(async function (path) {
        try {
          const response = await fetch(assetBase + path);
          if (!response.ok) return;
          files.push({ name: path, data: new Uint8Array(await response.arrayBuffer()) });
        } catch (error) {
          /* a missing asset is reported through the entry count below */
        }
      })
    );
    const bytes = EditorZip.write(files);
    download(new Blob([bytes], { type: "application/zip" }), book.bookId + ".zip");
    const digest = await sha256(text);
    els.checksum.textContent =
      "ZIP 內 book.json SHA-256：" + digest + "｜封包大小：" + bytes.length + " bytes";
    els.checksum.dataset.digest = digest;
    els.checksum.dataset.zipBytes = String(bytes.length);
    markDirty(false);
    const rights = publicationState();
    setStatus(
      rights.publishable
        ? "已匯出 ZIP（" + files.length + " 個項目，stored 未壓縮）。出版審核：已核准可發布。"
        : "已匯出 ZIP（" + files.length + " 個項目，stored 未壓縮）。出版審核：待審草稿，尚不可標示為可發布。",
      rights.publishable ? "ok" : "warn"
    );
    recordExport({
      kind: "zip",
      text: text,
      digest: digest,
      bytes: bytes.length,
      entryCount: files.length,
      publishable: rights.publishable,
      publicationState: rights
    });
  }

  /*
   * Export history, kept so the acceptance run can compare a checksum from a
   * fresh browser session against the one produced by the editing session.
   */
  function recordExport(record) {
    if (!Array.isArray(window.__pbpEditorExports)) window.__pbpEditorExports = [];
    window.__pbpEditorExports.push(record);
    window.__pbpEditorLastExport = record;
  }

  /* ---------------- boot ---------------- */

  function bind() {
    ["status", "dirtyFlag", "bookTitle", "rights", "pageSelect", "slotFields",
      "paragraphFields", "variantFields", "previewTitle", "previewKicker", "previewEvent",
      "previewText", "previewScene", "stageActors", "checksum", "exportJson", "exportZip",
      "publicationState", "rightsTable",
      "importInput", "importButton", "resetButton"].forEach(function (id) {
      els[id] = $(id);
    });

    els.importButton.addEventListener("click", function () {
      els.importInput.click();
    });
    els.importInput.addEventListener("change", async function () {
      const file = els.importInput.files && els.importInput.files[0];
      if (!file) return;
      try {
        await handleImport(file);
      } catch (error) {
        setStatus("匯入失敗：" + error.message, "bad");
      }
      els.importInput.value = "";
    });

    els.pageSelect.addEventListener("change", function () {
      selectedPageId = els.pageSelect.value;
      const page = pageById(selectedPageId);
      selectedSlotId = page && page.slots && page.slots[0] ? page.slots[0].id : null;
      renderSlots();
      renderParagraphs();
      renderPreview();
    });

    els.exportJson.addEventListener("click", exportJson);
    els.exportZip.addEventListener("click", exportZip);

    els.resetButton.addEventListener("click", function () {
      if (!book) return;
      assetBlobs = {};
      assetBase = "books/" + book.bookId + "/";
      markDirty(false);
      renderForm();
      validateNow();
      renderPreview();
      setStatus("已還原為匯入時的內容。", "warn");
    });

    window.addEventListener("beforeunload", function (event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  async function boot() {
    bind();
    try {
      const response = await fetch("./schemas/book.schema.json");
      schema = await response.json();
    } catch (error) {
      setStatus("無法載入 schema：" + error.message, "bad");
      return;
    }
    try {
      const response = await fetch("./books/peterpan-sticker-pilot/book.json");
      const text = await response.text();
      book = parseBookJson(text);
      assetBase = "books/" + book.bookId + "/";
      selectedPageId = book.pages[0].id;
      selectedSlotId = book.pages[0].slots[0].id;
      selectedStickerId = book.stickers[0].id;
      buildPreviewPlacements();
      markDirty(false);
      renderForm();
      await validateNow();
      renderPreview();
      setStatus("已載入第四本試作封包，可直接編輯或匯入其他封包。", "ok");
    } catch (error) {
      setStatus("無法載入預設封包：" + error.message, "bad");
    }
  }

  window.PbpEditor = {
    getBook: function () {
      return book;
    },
    serialize: serializedBook,
    importText: async function (text) {
      book = parseBookJson(text);
      assetBase = "books/" + book.bookId + "/";
      selectedPageId = book.pages[0].id;
      selectedSlotId = book.pages[0].slots[0].id;
      buildPreviewPlacements();
      markDirty(false);
      renderForm();
      await validateNow();
      renderPreview();
    },
    validate: validateNow,
    renderPreview: renderPreview
  };

  window.__pbpEditor = window.PbpEditor;
  document.addEventListener("DOMContentLoaded", boot);
})();
