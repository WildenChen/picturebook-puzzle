/*
 * Variant resolver: pick the asset to render for a sticker placed in a slot.
 *
 * Resolution order (first match wins):
 *   1. rule.then.variantOverrides[slotId]  -- explicit per-event override
 *   2. sticker.variants[slot.role]         -- slot semantics (sky-flyer, ...)
 *   3. sticker.variants[page.sceneRole]    -- scene-wide fallback variant
 *   4. sticker.defaultAsset                -- always-present default
 *
 * The resolved asset never changes the slot frame: frame size is owned by the
 * page layout, not by the sticker.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VariantResolver = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function resolveAsset(book, page, slot, stickerId, variantOverrides) {
    const stickers = book.stickers || [];
    const sticker = stickers.find((item) => item.id === stickerId);
    if (!sticker) return null;

    const overrides = variantOverrides || {};
    if (typeof overrides[slot.id] === "string" && overrides[slot.id].length) {
      return {
        asset: overrides[slot.id],
        source: "rule-override",
        role: slot.role,
        stickerId: sticker.id
      };
    }

    const variants = sticker.variants || {};
    if (typeof variants[slot.role] === "string") {
      return {
        asset: variants[slot.role],
        source: "slot-role",
        role: slot.role,
        stickerId: sticker.id
      };
    }
    if (page && page.sceneRole && typeof variants[page.sceneRole] === "string") {
      return {
        asset: variants[page.sceneRole],
        source: "scene-role",
        role: page.sceneRole,
        stickerId: sticker.id
      };
    }
    return {
      asset: sticker.defaultAsset,
      source: "default",
      role: slot.role,
      stickerId: sticker.id
    };
  }

  // Resolve every filled slot on a page at once.
  function resolvePage(book, page, placements, variantOverrides) {
    const pagePlacements = (placements && placements[page.id]) || {};
    const result = {};
    (page.slots || []).forEach((slot) => {
      const stickerId = pagePlacements[slot.id];
      if (!stickerId) return;
      const resolved = resolveAsset(book, page, slot, stickerId, variantOverrides);
      if (resolved) result[slot.id] = resolved;
    });
    return result;
  }

  return { resolveAsset: resolveAsset, resolvePage: resolvePage };
});
