#!/usr/bin/env node
/*
 * Regenerate the hostile test fixtures from the valid pilot package.
 * Each fixture mutates exactly one thing so the failing reason is
 * unambiguous in the test report.
 *
 *   node tests/make-fixtures.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "fixtures");
const BOOK = JSON.parse(
  fs.readFileSync(path.join(ROOT, "books", "peterpan-sticker-pilot", "book.json"), "utf8")
);

function copy() {
  return JSON.parse(JSON.stringify(BOOK));
}

function write(name, book) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(book, null, 2) + "\n", "utf8");
  process.stdout.write("wrote tests/fixtures/" + name + "\n");
}

const fixtures = {};

// 1. narrative without pageId
const missingPageId = copy();
delete missingPageId.narratives[0].pageId;
fixtures["invalid-missing-page-id.json"] = missingPageId;

// 2. duplicate page id
const duplicateId = copy();
duplicateId.pages.push(JSON.parse(JSON.stringify(duplicateId.pages[0])));
fixtures["invalid-duplicate-id.json"] = duplicateId;

// 3. paragraph token points at a slot that does not exist
const badSlotRef = copy();
badSlotRef.pages[0].paragraphs[0].parts[1].slotId = "no-such-slot";
fixtures["invalid-bad-slot-ref.json"] = badSlotRef;

// 4. unknown schema version
const unknownVersion = copy();
unknownVersion.schemaVersion = "9.9.9";
fixtures["invalid-unknown-schema-version.json"] = unknownVersion;

// 5. asset file missing from the package
const missingAsset = copy();
missingAsset.assets = missingAsset.assets.filter((asset) => asset.path !== "assets/sky.svg");
fixtures["invalid-missing-asset.json"] = missingAsset;

// 6. external SVG URL
const externalSvg = copy();
externalSvg.stickers[0].defaultAsset = "https://example.com/evil.svg";
fixtures["invalid-external-svg.json"] = externalSvg;

// 7. parent-directory escape
const parentPath = copy();
parentPath.pages[0].sceneAsset = "../../etc/passwd";
fixtures["invalid-parent-path.json"] = parentPath;

// 8. SVG carrying a script payload
const maliciousSvg = copy();
maliciousSvg.assets.push({
  path: "assets/malicious.svg",
  kind: "sticker",
  rightsReview: "pending",
  author: "unknown",
  provenance: "untrusted"
});
maliciousSvg.stickers[0].variants["sky-flyer"] = "assets/malicious.svg";
fixtures["invalid-malicious-svg.json"] = maliciousSvg;

// 9. undeclared field (schema uses a closed field set)
const unknownField = copy();
unknownField.pages[0].customScript = "alert(1)";
fixtures["invalid-unknown-field.json"] = unknownField;

// 10. narration segment pointing at a missing paragraph
const narrationRef = copy();
narrationRef.narration.segments[0].paragraphId = "p9-t9";
fixtures["invalid-narration-ref.json"] = narrationRef;

fs.mkdirSync(OUT, { recursive: true });
Object.keys(fixtures).forEach((name) => write(name, fixtures[name]));
