#!/usr/bin/env node
/*
 * Same-origin static server for the rollback rehearsal (AC-014).
 *
 *   node tests/rollback-server.js [port] [baselineDir]
 *
 * Serves the current working tree at "/" and the pre-change baseline commit
 * at "/baseline/". Both live on one origin on purpose: localStorage is
 * origin-scoped, so a rollback rehearsal across two ports would prove
 * nothing about the data. Same origin makes the storage comparison real.
 */
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PORT = Number(process.argv[2] || process.env.PBP_ROLLBACK_PORT || 8792);
const BASELINE_DIR = path.resolve(
  process.argv[3] || path.join(os.tmpdir(), "pbp-rollback-6394cde")
);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".zip": "application/zip"
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = path.normalize(path.join(root, decoded));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

const ROOT = path.resolve(__dirname, "..");

const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url;
  if (urlPath.indexOf("/baseline/") === 0) {
    const relative = urlPath.slice("/baseline".length) || "/index.html";
    const target = safeJoin(BASELINE_DIR, relative);
    if (!target) {
      res.writeHead(403).end("403");
      return;
    }
    sendFile(res, target);
    return;
  }
  const target = safeJoin(ROOT, urlPath);
  if (!target) {
    res.writeHead(403).end("403");
    return;
  }
  sendFile(res, target);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    "rollback server on http://127.0.0.1:" + PORT + "（baseline: " + BASELINE_DIR + "）\n"
  );
});
