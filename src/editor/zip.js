/*
 * Minimal ZIP reader/writer (store-only, no compression).
 *
 * Why store-only: the v1 editor must run on a plain static page with no
 * third-party dependency and no network access. A ZIP whose entries are
 * stored (compression method 0) is a valid ZIP that macOS Archive Utility,
 * the unzip CLI and every browser accept. The writer never compresses, so the
 * bytes of book.json inside the archive are byte-identical to the exported
 * JSON file, which is what the round-trip checksum evidence relies on.
 *
 * The reader accepts stored entries and reports a clear error for deflated
 * entries instead of silently producing an empty book.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EditorZip = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === "string") return new TextEncoder().encode(input);
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    throw new Error("不支援的內容型別");
  }

  function u16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
  }

  function u32(value) {
    return [
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    ];
  }

  function concat(chunks) {
    let total = 0;
    chunks.forEach((chunk) => {
      total += chunk.length;
    });
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }

  /* ---------------- writer ---------------- */

  /*
   * files: [{ name: "book.json", data: string|Uint8Array }]
   * Deterministic output: fixed DOS timestamp so the same input always
   * produces the same bytes (and therefore the same checksum).
   */
  function write(files) {
    const encoder = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    const dosTime = 0x0000; // 00:00:00
    const dosDate = 0x0021; // 1980-01-01

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const data = toBytes(file.data);
      const crc = crc32(data);

      const local = concat([
        new Uint8Array(u32(0x04034b50)),
        new Uint8Array(u16(20)),
        new Uint8Array(u16(0x0800)), // UTF-8 filename flag
        new Uint8Array(u16(0)), // stored
        new Uint8Array(u16(dosTime)),
        new Uint8Array(u16(dosDate)),
        new Uint8Array(u32(crc)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u32(data.length)),
        new Uint8Array(u16(nameBytes.length)),
        new Uint8Array(u16(0)),
        nameBytes
      ]);
      localChunks.push(local, data);

      centralChunks.push(
        concat([
          new Uint8Array(u32(0x02014b50)),
          new Uint8Array(u16(20)),
          new Uint8Array(u16(20)),
          new Uint8Array(u16(0x0800)),
          new Uint8Array(u16(0)),
          new Uint8Array(u16(dosTime)),
          new Uint8Array(u16(dosDate)),
          new Uint8Array(u32(crc)),
          new Uint8Array(u32(data.length)),
          new Uint8Array(u32(data.length)),
          new Uint8Array(u16(nameBytes.length)),
          new Uint8Array(u16(0)),
          new Uint8Array(u16(0)),
          new Uint8Array(u16(0)),
          new Uint8Array(u16(0)),
          new Uint8Array(u32(0)),
          new Uint8Array(u32(offset)),
          nameBytes
        ])
      );

      offset += local.length + data.length;
    });

    const central = concat(centralChunks);
    const end = concat([
      new Uint8Array(u32(0x06054b50)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(0)),
      new Uint8Array(u16(files.length)),
      new Uint8Array(u16(files.length)),
      new Uint8Array(u32(central.length)),
      new Uint8Array(u32(offset)),
      new Uint8Array(u16(0))
    ]);

    return concat(localChunks.concat([central, end]));
  }

  /* ---------------- reader ---------------- */

  function read(bytes) {
    const data = toBytes(bytes);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    let eocd = -1;
    const minEocd = 22;
    for (let i = data.length - minEocd; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new Error("不是有效的 ZIP 檔（找不到結尾目錄）");

    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries = [];

    for (let i = 0; i < entryCount; i += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) {
        throw new Error("ZIP 中央目錄損毀");
      }
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength));

      if (method !== 0) {
        throw new Error(
          "ZIP 項目「" + name + "」使用壓縮（method " + method + "）。" +
            "v1 編輯器只支援 stored 封包，請改用未壓縮匯出。"
        );
      }

      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      entries.push({
        name: name,
        data: data.slice(dataStart, dataStart + compressedSize)
      });

      cursor += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
  }

  return { write: write, read: read, crc32: crc32 };
});
