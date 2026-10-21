/*
 * Save adapter: versioned, book-scoped localStorage persistence.
 *
 * Only placements and the reading position are persisted. Facts and events
 * are always recomputed from placements, so a saved file can never contain a
 * stale derived value.
 *
 * Existing legacy keys are never read, written or removed.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SaveAdapter = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "storybook-book-v1-";

  function storageKey(bookId) {
    return PREFIX + bookId;
  }

  function emptyState() {
    return { pageIndex: 0, placements: {} };
  }

  function sanitize(raw) {
    const state = emptyState();
    if (!raw || typeof raw !== "object") return state;
    if (Number.isInteger(raw.pageIndex) && raw.pageIndex >= 0) {
      state.pageIndex = raw.pageIndex;
    }
    if (raw.placements && typeof raw.placements === "object") {
      Object.keys(raw.placements).forEach((pageId) => {
        const pagePlacements = raw.placements[pageId];
        if (!pagePlacements || typeof pagePlacements !== "object") return;
        const clean = {};
        Object.keys(pagePlacements).forEach((slotId) => {
          const stickerId = pagePlacements[slotId];
          if (typeof stickerId === "string" && stickerId.length) clean[slotId] = stickerId;
        });
        if (Object.keys(clean).length) state.placements[pageId] = clean;
      });
    }
    return state;
  }

  function load(bookId, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return emptyState();
    try {
      const raw = store.getItem(storageKey(bookId));
      if (!raw) return emptyState();
      return sanitize(JSON.parse(raw));
    } catch (error) {
      return emptyState();
    }
  }

  function save(bookId, state, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return false;
    try {
      store.setItem(storageKey(bookId), JSON.stringify(sanitize(state)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function clear(bookId, storage) {
    const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return false;
    try {
      store.removeItem(storageKey(bookId));
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    PREFIX: PREFIX,
    storageKey: storageKey,
    load: load,
    save: save,
    clear: clear,
    sanitize: sanitize,
    emptyState: emptyState
  };
});
