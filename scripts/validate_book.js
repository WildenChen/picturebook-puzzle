#!/usr/bin/env node
/*
 * CLI: validate a Book Package against schemas/book.schema.json plus the
 * referential-integrity rules in src/shared/book-validator.js.
 *
 * Usage:
 *   node scripts/validate_book.js [book.json ...]
 *
 * Exit code 0 = all packages valid, 1 = at least one error.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_FILE = path.join(ROOT, "schemas", "book.schema.json");
const validator = require(path.join(ROOT, "src", "shared", "book-validator.js"));

const DEFAULT_PACKAGES = [path.join("books", "peterpan-sticker-pilot", "book.json")];

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function report(file, result) {
  const label = path.relative(ROOT, file) || file;
  if (result.errors.length === 0) {
    process.stdout.write("PASS  " + label + "\n");
  } else {
    process.stdout.write("FAIL  " + label + "\n");
    result.errors.forEach((error) => {
      process.stdout.write("      - " + (error.path || "/") + ": " + error.message + "\n");
    });
  }
  result.warnings.forEach((warning) => {
    process.stdout.write("      ! " + (warning.path || "/") + ": " + warning.message + "\n");
  });
  return result.errors.length === 0;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length ? args : DEFAULT_PACKAGES;
  const schema = readJson(SCHEMA_FILE);
  if (!schema.ok) {
    process.stderr.write("無法讀取 schema: " + schema.message + "\n");
    process.exit(1);
  }

  let allValid = true;
  files.forEach((file) => {
    const abs = path.resolve(ROOT, file);
    if (!fs.existsSync(abs)) {
      process.stdout.write("FAIL  " + file + "\n      - 檔案不存在\n");
      allValid = false;
      return;
    }
    const parsed = readJson(abs);
    if (!parsed.ok) {
      process.stdout.write("FAIL  " + file + "\n      - JSON 解析失敗: " + parsed.message + "\n");
      allValid = false;
      return;
    }
    const result = validator.validateBook(parsed.value, schema.value, {
      assetRoot: path.dirname(abs)
    });
    if (!report(abs, result)) allValid = false;
  });

  process.exit(allValid ? 0 : 1);
}

main();
