#!/usr/bin/env node
/*
 * Build the approvable review sample required by AC-009
 * ("一份 AI 產生但權利未確認的草稿，以及可批准的示例").
 *
 *   node scripts/build-approval-sample.js
 *
 * The sample is derived from the pending pilot package so it always matches
 * the current schema. It exists purely to exercise the publication gate: the
 * real package (books/peterpan-sticker-pilot/book.json) stays `pending` and is
 * never touched by this script.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_DIR = path.join(ROOT, "books", "peterpan-sticker-pilot");
const SOURCE_FILE = path.join(PACKAGE_DIR, "book.json");
const OUT_FILE = path.join(PACKAGE_DIR, "approved-rights-sample.json");

function main() {
  const book = JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));

  book.source.rightsReview = "approved";
  book.source.rightsApprovedBy = "Wilden（人工審核樣本）";
  book.source.rightsApprovedAt = "2026-10-21";
  book.source.translationCredit = "本專案繁體中文改寫（人工審核樣本）";
  book.source.notes =
    "AC-009 審核樣本：以人工簽認狀態示範可發布封包的 metadata 形狀。" +
    "此檔不代表本專案已取得原著、譯文或插圖授權。";
  (book.assets || []).forEach(function (asset) {
    asset.rightsReview = "approved";
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(book, null, 2) + "\n");
  process.stdout.write(
    "wrote " + path.relative(ROOT, OUT_FILE) + "\nassets signed=" + (book.assets || []).length + "\n"
  );
}

main();
