/*
 * Shared Reader Runtime.
 *
 * Renders any Book Package through the shared engine. Contains no
 * book-specific content: everything comes from the loaded package.
 *
 * Interaction model: tap a sticker to select it, then tap a slot to place it.
 * Drag and drop is offered as an extra path, never as the only one.
 */
(function () {
  "use strict";

  const STAGE_ASPECT = 4 / 3;

  const els = {};
  let book = null;
  let pageIndex = 0;
  let placements = {};
  let selectedStickerId = null;
  let state = null;

  const $ = (id) => document.getElementById(id);

  function currentPage() {
    const order = StateMachine.pageOrder(book);
    return order[pageIndex];
  }

  function pageById(pageId) {
    return (book.pages || []).find((page) => page.id === pageId);
  }

  function slotHints() {
    const hints = {};
    (book.pages || []).forEach((page) => {
      (page.slots || []).forEach((slot) => {
        hints[page.id + "." + slot.id] = slot.hint && slot.hint["zh-Hant"];
      });
    });
    return hints;
  }

  /* ---------- persistence ---------- */

  function persist() {
    SaveAdapter.save(book.bookId, { pageIndex: pageIndex, placements: placements });
  }

  function restore() {
    const saved = SaveAdapter.load(book.bookId);
    placements = saved.placements;
    const order = StateMachine.pageOrder(book);
    pageIndex = Math.min(Math.max(0, saved.pageIndex), order.length - 1);
  }

  /* ---------- rendering ---------- */

  function renderTray() {
    const tray = els.stickerTray;
    tray.replaceChildren();
    (book.stickers || []).forEach((sticker) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sticker-chip";
      button.dataset.stickerId = sticker.id;
      button.setAttribute("aria-pressed", selectedStickerId === sticker.id ? "true" : "false");
      if (selectedStickerId === sticker.id) button.classList.add("is-selected");

      const img = document.createElement("img");
      img.src = "books/" + book.bookId + "/" + sticker.defaultAsset;
      img.alt = sticker.label["zh-Hant"];
      img.loading = "lazy";
      button.append(img, document.createTextNode(sticker.label["zh-Hant"]));
      button.draggable = true;
      button.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", sticker.id);
        e.dataTransfer.effectAllowed = "copy";
      });
      let pointer = null;
      button.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        pointer = { x: e.clientX, y: e.clientY };
      });
      button.addEventListener("pointerup", (e) => {
        if (!pointer) return;
        const moved = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 15;
        pointer = null;
        if (moved && els.stage && els.stage.contains(document.elementFromPoint(e.clientX, e.clientY))) {
          const touchedEl = document.elementFromPoint(e.clientX, e.clientY);
          const directBox = touchedEl && touchedEl.closest(".slot-box");
          const targetSlotId = directBox ? directBox.dataset.slotId : nearestSlotId(e.clientX, e.clientY);
          if (targetSlotId) {
            putSticker(targetSlotId, sticker.id);
          }
        }
      });
      button.addEventListener("click", () => {
        selectedStickerId = selectedStickerId === sticker.id ? null : sticker.id;
        render();
      });
      tray.append(button);
    });
    els.stickerCount.textContent = (book.stickers || []).length + " 張";
  }

  function slotBox(page, slot) {
    const frame = slot.frame;
    const box = document.createElement("button");
    box.type = "button";
    box.className = "slot-box";
    box.dataset.slotId = slot.id;
    box.dataset.role = slot.role;
    box.style.left = frame.left + "%";
    box.style.bottom = frame.bottom + "%";
    box.style.width = frame.width + "%";
    box.style.height = frame.height + "%";
    box.setAttribute("aria-label", slot.hint["zh-Hant"]);
    return box;
  }

  function renderStage() {
    const pageId = currentPage();
    const page = pageById(pageId);
    const pageState = state.pages[pageId];

    els.sceneImage.src = "books/" + book.bookId + "/" + page.sceneAsset;
    els.sceneImage.alt = page.title ? page.title["zh-Hant"] : "故事場景插畫";

    const actors = els.stageActors;
    actors.replaceChildren();

    (page.slots || []).forEach((slot) => {
      const box = slotBox(page, slot);
      const stickerId = (placements[pageId] || {})[slot.id];
      if (stickerId) {
        const resolved = pageState.variants[slot.id];
        const img = document.createElement("img");
        img.className = "slot-sticker";
        img.src = "books/" + book.bookId + "/" + resolved.asset;
        img.alt = "";
        img.dataset.variantSource = resolved.source;
        box.append(img);
        box.classList.add("is-filled");
      } else {
        const hint = document.createElement("span");
        hint.className = "slot-hint";
        hint.textContent = slot.hint["zh-Hant"];
        box.append(hint);
        box.classList.add("is-empty");
      }
      box.addEventListener("click", () => onSlotClick(pageId, slot));
      box.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      box.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const stickerId = e.dataTransfer.getData("text/plain");
        if (stickerId) putSticker(slot.id, stickerId);
      });
      actors.append(box);
    });

    els.stageHelp.textContent = selectedStickerId
      ? "已選取貼紙，點擊放置位置"
      : "選擇貼紙，再放進場景";
  }

  function renderStory() {
    const pageId = currentPage();
    const page = pageById(pageId);
    const pageState = state.pages[pageId];
    const context = { placements: placements, slotHints: slotHints(), pageId: pageId };
    els.storyText.replaceChildren(
      ...NarrativeRenderer.renderParagraphs(book, pageState.paragraphs, context)
    );
    els.pageTitle.textContent = page.title ? page.title["zh-Hant"] : "";
    els.pageChapter.textContent = page.kicker || "";
    els.pageClue.textContent = page.clue ? page.clue["zh-Hant"] : "";
    els.storyNote.textContent = "";
    els.feedback.textContent = "";
    els.feedback.dataset.eventId = pageState.eventId;
  }

  function renderNav() {
    const order = StateMachine.pageOrder(book);
    const nav = els.chapterNav;
    nav.replaceChildren();
    order.forEach((pageId, index) => {
      const page = pageById(pageId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = index === pageIndex ? "is-current" : "";
      button.textContent = (index + 1) + "・" + (page.title ? page.title["zh-Hant"] : pageId);
      button.addEventListener("click", () => {
        pageIndex = index;
        selectedStickerId = null;
        persist();
        render();
      });
      nav.append(button);
    });

    const order2 = order;
    els.readingProgress.textContent = "第 " + (pageIndex + 1) + " / " + order2.length + " 頁";
    els.prevPage.disabled = pageIndex === 0;
    els.nextPage.disabled = pageIndex === order2.length - 1;

    const solved = order2.filter((pageId) => {
      const pageState = state.pages[pageId];
      return pageState && pageState.eventId !== StateMachine.FALLBACK_EVENT_ID;
    }).length;
    els.completeCount.textContent = solved + " / " + order2.length;
    els.meterFill.style.width = (solved / order2.length) * 100 + "%";
  }

  function render() {
    state = StateMachine.computeState(book, placements);
    renderStory();
    renderStage();
    renderTray();
    renderNav();
  }

  /* ---------- interaction ---------- */

  function nearestSlotId(clientX, clientY) {
    const pageId = currentPage();
    const page = pageById(pageId);
    const slots = page ? page.slots || [] : [];
    if (!slots.length) return null;
    const stageRect = els.stage.getBoundingClientRect();
    const xp = ((clientX - stageRect.left) / stageRect.width) * 100;
    const yp = ((stageRect.bottom - clientY) / stageRect.height) * 100;
    let nearest = slots[0].id;
    let minDistance = Infinity;
    slots.forEach((slot) => {
      const f = slot.frame;
      const cx = f.left + f.width / 2;
      const cy = f.bottom + f.height / 2;
      const dist = (xp - cx) ** 2 + (yp - cy) ** 2;
      if (dist < minDistance) {
        minDistance = dist;
        nearest = slot.id;
      }
    });
    return nearest;
  }

  function putSticker(slotId, stickerId) {
    const pageId = currentPage();
    const stickerExists = (book.stickers || []).some((s) => s.id === stickerId);
    if (!stickerExists) return;
    placements[pageId] = placements[pageId] || {};
    placements[pageId][slotId] = stickerId;
    selectedStickerId = null;
    persist();
    render();
  }

  function onSlotClick(pageId, slot) {
    const current = (placements[pageId] || {})[slot.id];
    if (selectedStickerId) {
      placements[pageId] = placements[pageId] || {};
      placements[pageId][slot.id] = selectedStickerId;
      selectedStickerId = null;
    } else if (current) {
      delete placements[pageId][slot.id];
    } else {
      return;
    }
    persist();
    render();
  }

  function goToPage(index) {
    const order = StateMachine.pageOrder(book);
    const next = Math.min(Math.max(0, index), order.length - 1);
    if (next === pageIndex) return;
    pageIndex = next;
    selectedStickerId = null;
    persist();
    render();
    els.reader.scrollIntoView({ block: "start" });
  }

  function resetPage() {
    const pageId = currentPage();
    delete placements[pageId];
    selectedStickerId = null;
    persist();
    render();
  }

  function resetBook() {
    placements = {};
    pageIndex = 0;
    selectedStickerId = null;
    SaveAdapter.clear(book.bookId);
    render();
  }

  /* ---------- boot ---------- */

  function bind() {
    els.reader = $("reader");
    els.stage = $("stage");
    els.chapterNav = $("chapterNav");
    els.storyText = $("storyText");
    els.storyNote = $("storyNote");
    els.pageChapter = $("pageChapter");
    els.pageTitle = $("pageTitle");
    els.pageClue = $("pageClue");
    els.stickerTray = $("stickerTray");
    els.stickerCount = $("stickerCount");
    els.sceneImage = $("sceneImage");
    els.stageActors = $("stageActors");
    els.stageHelp = $("stageHelp");
    els.readingProgress = $("readingProgress");
    els.completeCount = $("completeCount");
    els.meterFill = $("meterFill");
    els.feedback = $("feedback");
    els.prevPage = $("prevPage");
    els.nextPage = $("nextPage");
    els.resetPage = $("resetPage");
    els.resetBook = $("resetBook");

    els.prevPage.addEventListener("click", () => goToPage(pageIndex - 1));
    els.nextPage.addEventListener("click", () => goToPage(pageIndex + 1));
    els.resetPage.addEventListener("click", resetPage);
    els.resetBook.addEventListener("click", resetBook);

    els.stage.addEventListener("dragover", (e) => e.preventDefault());
    els.stage.addEventListener("drop", (e) => {
      e.preventDefault();
      const stickerId = e.dataTransfer.getData("text/plain");
      if (stickerId) {
        const directBox = e.target.closest(".slot-box");
        const slotId = directBox ? directBox.dataset.slotId : nearestSlotId(e.clientX, e.clientY);
        if (slotId) putSticker(slotId, stickerId);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") goToPage(pageIndex - 1);
      if (event.key === "ArrowRight") goToPage(pageIndex + 1);
      if (event.key === "Escape") {
        selectedStickerId = null;
        render();
      }
    });
  }

  function start(bookData) {
    book = bookData;
    bind();
    restore();
    render();
  }

  /*
   * Developer-facing inspection surface. It exposes only what the current
   * view already holds; it never mutates state and is not shown to children.
   * Used by tests/browser-check.js as acceptance evidence.
   */
  function debugSnapshot() {
    const order = StateMachine.pageOrder(book);
    const pageId = order[pageIndex];
    const pageState = state.pages[pageId];
    const slotBoxes = Array.prototype.slice.call(
      document.querySelectorAll("#stageActors .slot-box")
    );
    const stickerImages = Array.prototype.slice.call(
      document.querySelectorAll("#stickerTray .sticker-chip img")
    );
    const sceneImage = document.getElementById("sceneImage");

    return {
      bookId: book.bookId,
      pageIndex: pageIndex,
      pageId: pageId,
      eventId: pageState ? pageState.eventId : null,
      facts: state.facts,
      placements: placements,
      chapterButtons: document.querySelectorAll(".chapter-nav button").length,
      stickerChips: document.querySelectorAll("#stickerTray .sticker-chip").length,
      stickerImagesLoaded: stickerImages.filter((img) => img.complete && img.naturalWidth > 0)
        .length,
      sceneLoaded: Boolean(sceneImage && sceneImage.complete && sceneImage.naturalWidth > 0),
      sceneSrc: sceneImage ? sceneImage.getAttribute("src") : null,
      slotBoxes: slotBoxes.length,
      filledSlots: slotBoxes.filter((box) => box.classList.contains("is-filled")).length,
      slotImages: document.querySelectorAll("#stageActors .slot-box img").length,
      slotImageSrcs: Array.prototype.slice
        .call(document.querySelectorAll("#stageActors .slot-box img"))
        .map((img) => img.getAttribute("src")),
      variantSources: slotBoxes.length
        ? Object.keys(state.pages[pageId].variants).map(
            (slotId) => state.pages[pageId].variants[slotId].source
          )
        : [],
      frames: slotBoxes.map((box) => {
        const rect = box.getBoundingClientRect();
        const stage = document.getElementById("stage").getBoundingClientRect();
        return {
          left: Math.round(((rect.left - stage.left) / stage.width) * 10000) / 100,
          bottom: Math.round(((stage.bottom - rect.bottom) / stage.height) * 10000) / 100,
          width: Math.round((rect.width / stage.width) * 10000) / 100,
          height: Math.round((rect.height / stage.height) * 10000) / 100
        };
      }),
      storyText: (document.getElementById("storyText").textContent || "").trim(),
      feedback: (document.getElementById("feedback").textContent || "").trim()
    };
  }

  function debugStorageSnapshot() {
    const legacyKeys = [
      "moonforest-story-v1",
      "moonforest-story-chatgpt-v1",
      "storybook-peterpan-original-v1",
      "storybook-sticker-demo-v1"
    ];
    const pilotKey = SaveAdapter.storageKey(book.bookId);
    return {
      pilotKey: pilotKey,
      pilotValue: window.localStorage.getItem(pilotKey),
      raw: window.localStorage.getItem(pilotKey) || "",
      legacyKeys: legacyKeys.map((key) => ({
        key: key,
        value: window.localStorage.getItem(key)
      }))
    };
  }

  window.SharedReader = {
    start: start,
    debugSnapshot: debugSnapshot,
    debugStorageSnapshot: debugStorageSnapshot
  };

  // Short aliases used by tests/browser-check.js.
  window.__pbpSnapshot = debugSnapshot;
  window.__pbpStorageSnapshot = debugStorageSnapshot;
})();
