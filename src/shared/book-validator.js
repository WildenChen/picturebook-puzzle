/*
 * Book Package validator: JSON Schema conformance plus referential integrity
 * checks a schema cannot express (dangling ids, duplicate ids, slot
 * references, rule ordering, narration mapping, asset path safety).
 *
 * Pure functions only. No filesystem writes, no network, no eval.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./json-schema.js"), require("./asset-safety.js"));
  } else {
    root.BookValidator = factory(root.BookSchema, root.AssetSafety);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (schemaLib, assetSafety) {
  "use strict";

  const SAFE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\/-]+$/;

  function indexBy(list, key, errors, label) {
    const map = new Map();
    (list || []).forEach((item, i) => {
      const id = item && item[key];
      if (typeof id !== "string") return;
      if (map.has(id)) {
        errors.push({
          path: "/" + label + "/" + i + "/" + key,
          message: "重複的 " + key + "：" + id
        });
      }
      map.set(id, item);
    });
    return map;
  }

  function collectParagraphIds(book) {
    const ids = new Map();
    (book.pages || []).forEach((page) => {
      (page.paragraphs || []).forEach((paragraph) => {
        ids.set(paragraph.id, { paragraph: paragraph, pageId: page.id, owner: "page" });
      });
    });
    (book.narratives || []).forEach((narrative) => {
      (narrative.paragraphs || []).forEach((paragraph) => {
        ids.set(paragraph.id, {
          paragraph: paragraph,
          pageId: null,
          owner: "narrative:" + narrative.id
        });
      });
    });
    return ids;
  }

  function checkAssetPath(errors, path, raw) {
    if (typeof raw !== "string" || !raw.length) return false;
    if (!SAFE_PATH.test(raw)) {
      errors.push({ path: path, message: "不安全的素材路徑：" + raw });
      return false;
    }
    if (/^https?:/i.test(raw) || raw.indexOf("//") === 0 || raw.indexOf("data:") === 0) {
      errors.push({ path: path, message: "素材路徑不得為外部網址：" + raw });
      return false;
    }
    return true;
  }

  function flattenConditions(condition, out) {
    if (!condition || typeof condition !== "object") return out;
    out.push(condition);
    if (Array.isArray(condition.all)) condition.all.forEach((c) => flattenConditions(c, out));
    if (Array.isArray(condition.any)) condition.any.forEach((c) => flattenConditions(c, out));
    if (condition.not) flattenConditions(condition.not, out);
    return out;
  }

  function validateSemantics(book) {
    const errors = [];
    const warnings = [];

    const pages = indexBy(book.pages, "id", errors, "pages");
    const stickers = indexBy(book.stickers, "id", errors, "stickers");
    const chapters = indexBy(book.chapters, "id", errors, "chapters");
    const rules = indexBy(book.rules, "id", errors, "rules");
    const narratives = indexBy(book.narratives, "id", errors, "narratives");

    const claimed = new Set();
    (book.chapters || []).forEach((chapter, ci) => {
      (chapter.pageIds || []).forEach((pageId, pi) => {
        if (!pages.has(pageId)) {
          errors.push({
            path: "/chapters/" + ci + "/pageIds/" + pi,
            message: "章節引用了不存在的頁面：" + pageId
          });
        }
        if (claimed.has(pageId)) {
          errors.push({
            path: "/chapters/" + ci + "/pageIds/" + pi,
            message: "頁面 " + pageId + " 被多個章節引用"
          });
        }
        claimed.add(pageId);
      });
    });
    (book.pages || []).forEach((page, pi) => {
      if (!chapters.has(page.chapterId)) {
        errors.push({
          path: "/pages/" + pi + "/chapterId",
          message: "引用了不存在的章節：" + page.chapterId
        });
      }
    });

    (book.pages || []).forEach((page, pi) => {
      checkAssetPath(errors, "/pages/" + pi + "/sceneAsset", page.sceneAsset);
      const slotIds = new Set();
      (page.slots || []).forEach((slot, si) => {
        if (slotIds.has(slot.id)) {
          errors.push({
            path: "/pages/" + pi + "/slots/" + si + "/id",
            message: "重複的 slot id：" + slot.id
          });
        }
        slotIds.add(slot.id);
        const frame = slot.frame || {};
        const right = (frame.left || 0) + (frame.width || 0);
        const top = (frame.bottom || 0) + (frame.height || 0);
        if (right > 100 || top > 100) {
          errors.push({
            path: "/pages/" + pi + "/slots/" + si + "/frame",
            message:
              "slot 框超出場景範圍（left+width 與 bottom+height 不得超過 100）"
          });
        }
      });
      (page.paragraphs || []).forEach((paragraph, qi) => {
        (paragraph.parts || []).forEach((part, pi2) => {
          if (part.type === "slot" && !slotIds.has(part.slotId)) {
            errors.push({
              path:
                "/pages/" + pi + "/paragraphs/" + qi + "/parts/" + pi2 + "/slotId",
              message: "段落引用了不存在的 slot：" + part.slotId
            });
          }
        });
      });
      (page.ruleIds || []).forEach((ruleId, ri) => {
        if (!rules.has(ruleId)) {
          errors.push({
            path: "/pages/" + pi + "/ruleIds/" + ri,
            message: "引用了不存在的規則：" + ruleId
          });
        }
      });
    });

    const prioritySeen = new Map();
    (book.rules || []).forEach((rule, ri) => {
      if (!pages.has(rule.pageId)) {
        errors.push({
          path: "/rules/" + ri + "/pageId",
          message: "規則指向不存在的頁面：" + rule.pageId
        });
      }
      const page = pages.get(rule.pageId);
      const slotIds = new Set((page && page.slots ? page.slots : []).map((s) => s.id));
      flattenConditions(rule.when, []).forEach((cond) => {
        if (cond.slotEquals) {
          if (!slotIds.has(cond.slotEquals[0])) {
            errors.push({
              path: "/rules/" + ri + "/when",
              message: "條件引用了頁面上不存在的 slot：" + cond.slotEquals[0]
            });
          }
          if (!stickers.has(cond.slotEquals[1])) {
            errors.push({
              path: "/rules/" + ri + "/when",
              message: "條件引用了不存在的貼紙：" + cond.slotEquals[1]
            });
          }
        }
        if (cond.slotEmpty && !slotIds.has(cond.slotEmpty)) {
          errors.push({
            path: "/rules/" + ri + "/when",
            message: "條件引用了不存在的 slot：" + cond.slotEmpty
          });
        }
        if (cond.slotFilled && !slotIds.has(cond.slotFilled)) {
          errors.push({
            path: "/rules/" + ri + "/when",
            message: "條件引用了不存在的 slot：" + cond.slotFilled
          });
        }
      });
      const then = rule.then || {};
      if (then.narrativeId && !narratives.has(then.narrativeId)) {
        errors.push({
          path: "/rules/" + ri + "/then/narrativeId",
          message: "引用了不存在的敘事版本：" + then.narrativeId
        });
      }
      const slotOverrides = then.variantOverrides || {};
      Object.keys(slotOverrides).forEach((slotId) => {
        if (page && slotIds.size && !slotIds.has(slotId)) {
          errors.push({
            path: "/rules/" + ri + "/then/variantOverrides/" + slotId,
            message: "變體覆寫指向不存在的 slot：" + slotId
          });
        }
      });
      const key = rule.pageId + ":" + rule.priority;
      if (prioritySeen.has(key)) {
        warnings.push({
          path: "/rules/" + ri + "/priority",
          message:
            "頁面 " +
            rule.pageId +
            " 內有相同 priority 的規則，將以 ruleId 升序穩定排序：" +
            prioritySeen.get(key) +
            " / " +
            rule.id
        });
      } else {
        prioritySeen.set(key, rule.id);
      }
    });

    (book.stickers || []).forEach((sticker, si) => {
      checkAssetPath(errors, "/stickers/" + si + "/defaultAsset", sticker.defaultAsset);
      const variants = sticker.variants || {};
      Object.keys(variants).forEach((key) => {
        checkAssetPath(errors, "/stickers/" + si + "/variants/" + key, variants[key]);
      });
    });

    const paragraphIds = collectParagraphIds(book);
    (book.narratives || []).forEach((narrative, ni) => {
      const ownerPage = pages.get(narrative.pageId);
      if (!ownerPage) {
        errors.push({
          path: "/narratives/" + ni + "/pageId",
          message: "敘事指向不存在的頁面：" + narrative.pageId
        });
      }
      (narrative.paragraphs || []).forEach((paragraph, pi) => {
        const owned = ownerPage &&
          (ownerPage.paragraphs || []).some((p) => p.id === paragraph.id);
        if (!owned) {
          errors.push({
            path: "/narratives/" + ni + "/paragraphs/" + pi + "/id",
            message:
              "敘事的段落必須是頁面 " +
              narrative.pageId +
              " 既有段落的覆寫：" +
              paragraph.id
          });
        }
      });
    });

    const segments = (book.narration && book.narration.segments) || [];
    const segmentIds = new Set();
    segments.forEach((segment, si) => {
      if (segmentIds.has(segment.id)) {
        errors.push({
          path: "/narration/segments/" + si + "/id",
          message: "重複的朗讀 segment id：" + segment.id
        });
      }
      segmentIds.add(segment.id);
      if (!paragraphIds.has(segment.paragraphId)) {
        errors.push({
          path: "/narration/segments/" + si + "/paragraphId",
          message: "朗讀 segment 指向不存在的段落：" + segment.paragraphId
        });
      }
      if (segment.audioAsset !== null && segment.audioAsset !== undefined) {
        checkAssetPath(errors, "/narration/segments/" + si + "/audioAsset", segment.audioAsset);
      }
    });

    // Aggregate variant fallbacks per (sticker, role) so a missing variant is
    // reported once instead of once per slot that uses the role.
    //
    // A role only "expects" contextual variants when at least one sticker in
    // the book defines one for that role. A role that nobody customises
    // (for example the indoor visitor slot) is a deliberate default-only
    // design, not a missing asset, so it must not produce a warning.
    const roleProviders = new Map();
    (book.stickers || []).forEach((sticker) => {
      Object.keys(sticker.variants || {}).forEach((role) => {
        roleProviders.set(role, (roleProviders.get(role) || 0) + 1);
      });
    });
    const missingVariants = new Map();
    (book.pages || []).forEach((page) => {
      (page.slots || []).forEach((slot) => {
        if (!roleProviders.has(slot.role)) return;
        (book.stickers || []).forEach((sticker) => {
          const variants = sticker.variants || {};
          if (Object.prototype.hasOwnProperty.call(variants, slot.role)) return;
          const key = sticker.id + "|" + slot.role;
          if (!missingVariants.has(key)) {
            missingVariants.set(key, {
              stickerId: sticker.id,
              label: sticker.label && sticker.label["zh-Hant"],
              role: slot.role,
              pages: []
            });
          }
          const entry = missingVariants.get(key);
          if (entry.pages.indexOf(page.id) === -1) entry.pages.push(page.id);
        });
      });
    });
    missingVariants.forEach((entry) => {
      warnings.push({
        path: "/stickers/" + entry.stickerId,
        message:
          "貼紙「" +
          entry.label +
          "」缺少情境變體 " +
          entry.role +
          "（頁面 " +
          entry.pages.join(", ") +
          "），將回退至 default 素材"
      });
    });

    /*
     * Rights consistency (AC-009).
     *
     * The package level `source.rightsReview` must never claim approval while
     * individual assets are still unsigned. This is a warning rather than an
     * error so that a legitimately pending package keeps validating, but the
     * inconsistency is always surfaced.
     */
    const source = book.source || {};
    const notApproved = (book.assets || []).filter(function (asset) {
      return asset && asset.rightsReview !== "approved";
    });
    if (source.rightsReview === "approved" && notApproved.length) {
      warnings.push({
        path: "/source/rightsReview",
        message:
          "封包層級標示為 approved，但仍有 " +
          notApproved.length +
          " 項素材未核准，不可對外宣稱可發布"
      });
    }

    if (source.rightsReview === "approved") {
      /*
       * Approval without a named human reviewer is not a sign-off. The
       * editor never writes these fields, so the package can only carry them
       * if a person filled them in by hand.
       */
      if (!source.rightsApprovedBy || !String(source.rightsApprovedBy).trim()) {
        warnings.push({
          path: "/source/rightsApprovedBy",
          message: "封包標示為 approved，但缺少人工簽認者 rightsApprovedBy，不可視為已通過出版審核"
        });
      }
      if (!source.rightsApprovedAt || !String(source.rightsApprovedAt).trim()) {
        warnings.push({
          path: "/source/rightsApprovedAt",
          message: "封包標示為 approved，但缺少簽認時間 rightsApprovedAt"
        });
      }
      if (!source.translationCredit || String(source.translationCredit).trim() === "待指定") {
        warnings.push({
          path: "/source/translationCredit",
          message: "翻譯署名尚未指定，發布前必須補齊譯者 credit"
        });
      }
    }

    return { errors: errors, warnings: warnings };
  }

  function validateBook(book, schema, options) {
    const errors = [];
    const warnings = [];
    if (!book || typeof book !== "object" || Array.isArray(book)) {
      return {
        errors: [{ path: "", message: "Book Package 必須是 JSON 物件" }],
        warnings: []
      };
    }
    schemaLib.validate(book, schema).forEach((error) => errors.push(error));
    if (errors.length === 0) {
      const semantics = validateSemantics(book);
      semantics.errors.forEach((error) => errors.push(error));
      semantics.warnings.forEach((warning) => warnings.push(warning));
      // Asset manifest and on-disk SVG screening run only when the package
      // structure is sound, so errors stay attributable to one cause.
      if (assetSafety && assetSafety.checkPackageAssets) {
        const assetResult = assetSafety.checkPackageAssets(book, options || {});
        assetResult.errors.forEach((error) => errors.push(error));
        assetResult.warnings.forEach((warning) => warnings.push(warning));
      }
    } else {
      warnings.push({ path: "", message: "因結構錯誤未執行語意檢查" });
    }
    return { errors: errors, warnings: warnings };
  }

  return { validateBook: validateBook, validateSemantics: validateSemantics };
});
