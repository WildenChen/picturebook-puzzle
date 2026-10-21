/*
 * Asset safety: path checks plus on-disk SVG content screening.
 *
 * The validator never executes imported files. SVG assets are treated as
 * images: any script, event handler, external reference or embedded foreign
 * document is rejected outright rather than sanitised.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("fs"), require("path"));
  } else {
    // Browser branch: no filesystem access. Path rules still apply, but the
    // on-disk SVG screening is skipped and reported as a warning.
    root.AssetSafety = factory(null, null);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (fs, path) {
  "use strict";

  const SAFE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\/-]+$/;

  // Patterns that make an SVG unsafe to serve as an <img> source or inline.
  const FORBIDDEN_SVG = [
    { re: /<\s*script/i, reason: "包含 <script> 元素" },
    { re: /\son[a-z]+\s*=/i, reason: "包含事件處理屬性（on*）" },
    { re: /<\s*foreignObject/i, reason: "包含 <foreignObject> 元素" },
    { re: /<\s*(iframe|embed|object|use\b[^>]*xlink:href\s*=\s*["']https?:)/i, reason: "包含外部內容引用" },
    { re: /javascript\s*:/i, reason: "包含 javascript: URI" },
    { re: /<\s*(a|img|image)[^>]*\b(?:xlink:)?href\s*=\s*["'](?:https?:|\/\/|data:)/i, reason: "包含外部或 data URI 參照" },
    { re: /<\s*handler/i, reason: "包含 <handler> 元素" },
    { re: /<\s*set\b[^>]*\battributeName\s*=\s*["']on/i, reason: "以 <set> 注入事件屬性" }
  ];

  function isSafePath(raw) {
    if (typeof raw !== "string" || !raw.length) return false;
    if (!SAFE_PATH.test(raw)) return false;
    if (/^https?:/i.test(raw) || raw.indexOf("//") === 0 || raw.indexOf("data:") === 0) return false;
    return true;
  }

  function screenSvgContent(content) {
    const problems = [];
    if (typeof content !== "string") return problems;
    FORBIDDEN_SVG.forEach((entry) => {
      if (entry.re.test(content)) problems.push(entry.reason);
    });
    return problems;
  }

  /*
   * Inspect every asset referenced by the package.
   *
   * options.assetRoot: directory the package paths are relative to.
   * options.readFile : optional override for reading file contents (tests).
   * Returns { errors: [...], warnings: [...] } with JSON-pointer-like paths.
   */
  function checkPackageAssets(book, options) {
    const opts = options || {};
    const errors = [];
    const warnings = [];
    const assetRoot = opts.assetRoot;

    const declared = new Map();
    (book.assets || []).forEach((asset, index) => {
      if (!asset || typeof asset.path !== "string") return;
      if (declared.has(asset.path)) {
        errors.push({
          path: "/assets/" + index + "/path",
          message: "素材重複宣告：" + asset.path
        });
      }
      declared.set(asset.path, asset);
    });

    const referenced = new Map();
    function reference(raw, path) {
      if (typeof raw !== "string" || !raw.length) return;
      if (!referenced.has(raw)) referenced.set(raw, path);
    }
    (book.pages || []).forEach((page, pi) => {
      reference(page.sceneAsset, "/pages/" + pi + "/sceneAsset");
    });
    (book.stickers || []).forEach((sticker, si) => {
      reference(sticker.defaultAsset, "/stickers/" + si + "/defaultAsset");
      Object.keys(sticker.variants || {}).forEach((role) => {
        reference(sticker.variants[role], "/stickers/" + si + "/variants/" + role);
      });
    });
    ((book.narration && book.narration.segments) || []).forEach((segment, si) => {
      reference(segment.audioAsset, "/narration/segments/" + si + "/audioAsset");
    });

    referenced.forEach((refPath, raw) => {
      if (!isSafePath(raw)) {
        errors.push({ path: refPath, message: "不安全的素材路徑：" + raw });
        return;
      }
      if (!declared.has(raw)) {
        errors.push({
          path: refPath,
          message: "素材未在 assets 清單中宣告：" + raw
        });
      }
    });

    declared.forEach((asset, raw) => {
      if (!isSafePath(raw)) {
        errors.push({ path: "/assets", message: "不安全的素材路徑：" + raw });
        return;
      }
      if (!assetRoot) return;
      const fsImpl = opts.fs || fs;
      const pathImpl = opts.path || path;
      if (!fsImpl || !pathImpl) {
        if (!warnings.some((w) => w.message.indexOf("瀏覽器環境無法讀取磁碟") === 0)) {
          warnings.push({
            path: "/assets",
            message: "瀏覽器環境無法讀取磁碟，略過素材內容檢查"
          });
        }
        return;
      }
      const absolute = pathImpl.resolve(assetRoot, raw);
      const rootResolved = pathImpl.resolve(assetRoot);
      if (absolute.indexOf(rootResolved + pathImpl.sep) !== 0 && absolute !== rootResolved) {
        errors.push({ path: "/assets", message: "素材路徑逃出封包目錄：" + raw });
        return;
      }
      if (!fsImpl.existsSync(absolute)) {
        errors.push({ path: "/assets", message: "素材檔不存在：" + raw });
        return;
      }
      if (pathImpl.extname(raw).toLowerCase() === ".svg") {
        const content = fsImpl.readFileSync(absolute, "utf8");
        const problems = screenSvgContent(content);
        problems.forEach((reason) => {
          errors.push({ path: "/assets", message: "素材 " + raw + " 不安全：" + reason });
        });
      }
    });

    return { errors: errors, warnings: warnings };
  }

  return {
    isSafePath: isSafePath,
    screenSvgContent: screenSvgContent,
    checkPackageAssets: checkPackageAssets,
    FORBIDDEN_SVG: FORBIDDEN_SVG
  };
});
