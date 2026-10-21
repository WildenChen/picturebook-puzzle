/*
 * Narrative renderer: turns paragraph parts into DOM using text nodes only.
 *
 * No innerHTML, no insertAdjacentHTML, no eval. Untrusted strings from the
 * book package can only ever become text nodes.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NarrativeRenderer = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function stickerLabel(book, stickerId) {
    const sticker = (book.stickers || []).find((item) => item.id === stickerId);
    if (!sticker) return "";
    return sticker.storyLabel || (sticker.label && sticker.label["zh-Hant"]) || sticker.id;
  }

  /*
   * Render one paragraph into a fresh <p> element.
   *
   * context.placements[pageId][slotId] -> stickerId | undefined
   * context.slotHints[pageId + "." + slotId] -> hint text for empty slots
   */
  function renderParagraph(book, paragraph, context) {
    const el = document.createElement("p");
    (paragraph.parts || []).forEach((part) => {
      if (part.type === "text") {
        el.append(document.createTextNode(part.value || ""));
        return;
      }
      const slotId = part.slotId;
      const placements = (context.placements && context.placements[context.pageId]) || {};
      const placed = placements[slotId];
      const span = document.createElement("span");
      span.dataset.storySlot = slotId;
      if (placed) {
        span.className = "story-token-filled";
        span.textContent = stickerLabel(book, placed);
        span.setAttribute("aria-label", "已放入：" + stickerLabel(book, placed));
      } else {
        const hint = (context.slotHints && context.slotHints[context.pageId + "." + slotId]) || "等待貼紙";
        span.className = "story-token-hint";
        span.textContent = "【" + hint + "】";
        span.setAttribute("aria-label", "待放入：" + hint);
      }
      el.append(span);
    });
    return el;
  }

  function renderParagraphs(book, paragraphs, context) {
    return (paragraphs || []).map((paragraph) => renderParagraph(book, paragraph, context));
  }

  return { renderParagraph: renderParagraph, renderParagraphs: renderParagraphs, stickerLabel: stickerLabel };
});
