# PROJECT_STATUS.md — 互動童書 v1.0 重構執行紀錄

> 依 `AGENTS.md` 的里程碑規則維護。記錄 SHA、已做、已測、未測、證據、風險與下一步。
> 本檔只記錄**本機分支**上的實際執行結果；未經授權不 push、不部署。

## 目前狀態

| 項目 | 值 |
| --- | --- |
| 分支 | `codex/v1-book-platform` |
| 基準 SHA | `6394cde7dcf1dfb02775885a7ade787b6960d515`（`main`） |
| 本分支 HEAD | `49c7efc`（測試與證據）＋ 前四個里程碑 commit；基準仍為 `6394cde` |
| 環境 | macOS Apple Silicon、Node v24.16.0、Python 3.14.6、Chrome/155.0.8059.85（headless，CDP 驅動） |
| 本機預覽 server | `python3 -m http.server 8791`（`127.0.0.1:8791`；8765 已被其他服務占用） |
| 回滾對照 server | `node tests/rollback-server.js 8792 /tmp/pbp-rollback-6394cde`（現行版掛 `/`、基準版掛 `/baseline/`，同源） |
| 權利審核 | `rightsReview: pending`（未變更，維持待人工審核） |
| 部署狀態 | 未 push、未部署、未變更 GitHub Pages／公開權限／網域／Cloudflare |

### Milestone commits（`codex/v1-book-platform`）

| SHA | 內容 |
| --- | --- |
| `bfbc746` | 規格文件：PRODUCT／ARCHITECTURE／ACCEPTANCE／AGENTS／START_CODEX |
| `d7020be` | Book Package schema、驗證器、安全篩查、第四本封包產生器與審核樣本 |
| `258e37e` | 共用規則引擎、變體解析、狀態機、存檔轉接、朗讀渲染、共用閱讀器 |
| `cbc98e6` | 本機製書編輯器（含出版審核閘門）與 store-only ZIP 讀寫 |
| `49c7efc` | 測試套件、驗收截圖、效能基線、回滾演練 |

## 交付物

### 規格文件（依 `START_CODEX.md` 放入 repository 根目錄）

`PRODUCT.md`、`ARCHITECTURE.md`、`ACCEPTANCE.md`、`AGENTS.md`、`START_CODEX.md`

### 新增程式

| 路徑 | 用途 |
| --- | --- |
| `schemas/book.schema.json` | Book Package JSON Schema（Draft 2020-12 子集，自製驗證器）；含 `source.draftOrigin`／`rightsApprovedBy`／`rightsApprovedAt` 權利欄位 |
| `src/shared/json-schema.js` | 無依賴 JSON Schema 驗證器 |
| `src/shared/book-validator.js` | Schema 檢查 + 引用完整性 + 語意檢查 + 權利一致性檢查（純函式） |
| `src/shared/asset-safety.js` | 素材路徑安全與 SVG 內容篩查 |
| `src/core/rule-evaluator.js` | 有限條件 DSL 規則評估（無 `eval`／無任意 JS） |
| `src/core/variant-resolver.js` | 貼紙變體解析（rule override → slot role → scene role → default） |
| `src/core/state-machine.js` | 每次從頭重算的狀態機（`facts`／`events` 不持久化） |
| `src/player/save-adapter.js` | 存檔隔離與消毒（新 key `storybook-book-v1-${bookId}`） |
| `src/player/narrative-renderer.js` | 段落／slot token 的安全 DOM 渲染 |
| `src/player/reader.js`、`reader.css` | 共用閱讀引擎（`reader-pilot.html` 入口） |
| `src/editor/editor.js`、`editor.css` | 本機視覺化製書工具（`editor.html` 入口）；含出版審核面板與發布閘門 |
| `src/editor/zip.js` | store-only ZIP 讀寫（無第三方依賴） |
| `scripts/build-pilot-book.js` | 由既有 SVG 產生第四本 Book Package |
| `scripts/validate_book.js` | 單檔驗證 CLI |
| `scripts/build-approval-sample.js` | 產生 AC-009 的「可批准示例」（由 pending 封包衍生，正式封包不受影響） |
| `tests/performance-check.js` | AC-015 本機效能基線（載入、互動延遲、網路、封包大小） |
| `tests/rollback-check.js` | AC-014 回滾／恢復演練 |
| `tests/rollback-server.js` | 同源靜態伺服器（基準版掛 `/baseline/`） |

### 既有檔案

`index.html`／`app.js`、`peterpan.html`／`peterpan/reader.js`、`sticker-demo.html`／`sticker-demo/reader.js` **完全未修改**。新舊 runtime 以不同入口並存。

## 第四本封包（`books/peterpan-sticker-pilot/`）

- 3 頁（`p1` 房間、`p2` 天空、`p3` 森林）、6 貼紙、2 slots／頁、27 條規則、**27 種事件 ID**、27 條 narrative、**60 個朗讀 segment**。
- 跨頁因果包含 `shadowRecovered → fliesAfterShadow`、`dustSparkFound → forestWithDust`、`dustOverHouse → houseFlewToo` 等。
- 17 個 SVG 素材（既有 `sticker-demo/art/` 副本）。
- `book.json` 77,878 bytes；封包目錄 148K。
- `source.rightsReview = "pending"`，`source.draftOrigin = "ai-generated"`（明示為 AI／Codex 產生的結構化草稿），`translationCredit = "待指定"`。
- `books/peterpan-sticker-pilot/approved-rights-sample.json`：**可核准的審核樣本**（AC-009 要求的「可批准的示例」）。此檔是為了驗證閘門行為而存在的樣本，**不是本專案的正式封包**，不得當成已取得授權的證明；正式封包 `book.json` 維持 `pending`。

## 已執行測試（實際結果）

| 命令 | 結果 |
| --- | --- |
| `node scripts/build-pilot-book.js` | wrote `books/peterpan-sticker-pilot/book.json`；pages=3 stickers=6 rules=27 events=27 narratives=27 segments=60 |
| `node scripts/validate_book.js books/peterpan-sticker-pilot/book.json` | **PASS**，10 條缺變體 fallback 警告（預期行為，AC-004） |
| `node scripts/build-approval-sample.js` | wrote `books/peterpan-sticker-pilot/approved-rights-sample.json`；assets signed=17（正式封包 `book.json` 不受影響） |
| `node scripts/validate_book.js books/peterpan-sticker-pilot/approved-rights-sample.json` | **PASS**（審核樣本；無權利警告） |
| `node tests/run-tests.js` | **50 passed, 0 failed** |
| `node tests/browser-check.js http://127.0.0.1:8791/reader-pilot.html` | **25 passed, 0 failed** |
| `node tests/editor-check.js http://127.0.0.1:8791/editor.html` | **40 passed, 0 failed** |
| `node tests/legacy-check.js http://127.0.0.1:8791` | **16 passed, 0 failed** |
| `node tests/performance-check.js http://127.0.0.1:8791/reader-pilot.html http://127.0.0.1:8791/editor.html` | **8 passed, 0 failed**（基線寫入 `tests/artifacts/performance-baseline.json`） |
| `node tests/rollback-check.js http://127.0.0.1:8792 http://127.0.0.1:8792/baseline` | **16 passed, 0 failed** |
| `node --check` × 25 個 JS 檔 | 全部通過 |
| `git diff --check` | 無空白錯誤 |

### 截圖證據

- `tests/artifacts/reader-pilot-page2.png`
- `tests/artifacts/reader-pilot-page1-room.png`（房間場景，影子以 `shadow-floor.svg` 變體放置）
- `tests/artifacts/reader-pilot-page3-forest.png`（森林場景，迷失男孩以 `boys-building.svg` 施工姿勢＋樹葉小屋）
- `tests/artifacts/reader-pilot-mobile.png`（390×844 mobile 模擬，slot 提示改為置中 chip，無溢出）
- `tests/artifacts/editor-preview.png`
- `tests/artifacts/editor-rights-gate.png`（編輯器出版審核面板：書封層級＋17 項素材的權利狀態）
- `tests/artifacts/performance-baseline.json`（AC-015 實測基線）

### 核心測試覆蓋

- 有效封包通過驗證；10 個無效 fixture 全部被定位拒絕（缺 `pageId`、重複 ID、錯 slot 引用、未知 `schemaVersion`、未知欄位、缺素材、`..` 路徑、外部 SVG、惡意 SVG、錯誤 narration 引用）。
- 36 種單一位置替換矩陣 + 6×6 完整組合皆可計算不崩潰。
- slot 框大小不因貼紙 ID／對錯／種類改變。
- 天空角色使用飛行變體、森林建造使用施工姿勢；缺變體回退 default 且來源標記正確。
- 規則排序：`priority` 降序 → `ruleId` 升序；JSON 鍵順序不同結果一致。
- 27 種事件、每頁多個可達事件、跨頁因果（第一頁 `shadowRecovered` 影響第二頁、第三頁依賴第二頁 `dust` 事實）。
- 改放後完全重算，無過期事實殘留。
- 存檔：新 key 與 4 個舊 key 完全隔離；清除只刪新 key；存檔只含 `pageIndex`／`placements`；非法值消毒；損毀 JSON 退回預設。
- 編輯器 ZIP：round-trip、stored-only 決定性輸出、CRC32 已知向量、損毀 ZIP 明確報錯、壓縮項目明確拒絕。
- 效能基線：閱讀器載入、貼紙放置延遲、全書狀態重算、封包大小、閱讀期網路請求與模型呼叫數皆為實測值並寫入 `tests/artifacts/performance-baseline.json`。
- 回滾演練：基準 SHA 的三個舊入口可讀；新 v1 存檔在回滾／恢復往返後逐位元一致。
- 權利閘門（AC-009）：封包層級標 `approved` 但素材未核准 → 產生權利一致性警告；一致的待審封包 → 驗證不失敗也不產生權利警告；缺 `rightsApprovedBy`／`rightsApprovedAt`／`translationCredit` → 逐項警告；審核樣本 → 零權利警告且驗證通過；正式封包維持 `pending` 且未被自動升格。
- Secret scan（AC-009）：掃過 `src/`、`schemas/`、`books/`、`tests/`、`editor.html`、`reader-pilot.html`，未發現 API key／token／私鑰樣式；封包 JSON 亦無憑證欄位。

## 15 項驗收結果

> 依 `ACCEPTANCE.md` 規定：無真實 iPhone／iPad 證據不得標 Pass。

| AC | 項目 | 結果 | 依據 |
| --- | --- | --- | --- |
| AC-001 | 乾淨啟動和書籍載入 | **Pass**（本機環境） | `browser-check.js` 25/25；3 場景、6 貼紙全載入，無 console 錯誤與失敗請求；啟動命令 `python3 -m http.server 8791` |
| AC-002 | Book Package 格式與拒絕錯誤資料 | **Pass** | 10 個無效 fixture 逐一定位；`editor-check.js` 驗證無效封包時匯出按鈕停用且 UI 顯示錯誤 |
| AC-003 | 放置框大小與坐標一致性 | **Pass**（桌面比例） | 36 種矩陣 + 全部組合測試；放置前後框 JSON 完全相同；均在 4:3 場景範圍內。**手機實機比例未驗** |
| AC-004 | 貼紙語境／姿勢變體 | **Pass**（程式層）／目視待審 | 天空角色確為飛行變體、森林為施工姿勢；缺變體回退 default 並記 10 條警告。**變體是否為「合理飛行姿勢」仍需人工目視確認** |
| AC-005 | 角色組合事件 | **Pass** | 27 種事件 ID（規格要求 ≥10）；未配置組合有可理解 fallback；規則優先級固定。三張關鍵畫面截圖齊備：房間（影子變體）、天空（飛行變體）、森林（施工姿勢＋樹葉小屋） |
| AC-006 | 跨頁因果及重算 | **Pass** | `shadowRecovered → fliesAfterShadow` 瀏覽器實測；改放後完全重算；reload 後結果相同 |
| AC-007 | 文字提示與可讀性 | **Pass** | token 顯示貼紙名稱；無 `innerHTML`，全部 text node；paragraph ID 穩定 |
| AC-008 | 編輯器所見即所得與匯入／匯出 | **Pass** | `editor-check.js` 24/24：改框位置／提示詞／變體保留、即時預覽、JSON SHA-256、ZIP 含素材、新 session 重新匯入 checksum 一致 |
| AC-009 | AI 草稿／權利審核閘門 | **Pass**（權利閘門） | 發布閘門已實作並實測：未核准封包在編輯器顯示「未核准可發布」，匯出時 `publishable=false` 且狀態文字明示「待審草稿」；只有封包層級與全部 17 項素材皆 `approved`、且具備人工簽認者 `rightsApprovedBy`／簽認時間 `rightsApprovedAt`／譯者署名時，才會顯示「已核准可發布」。草稿來源以 `source.draftOrigin = "ai-generated"` 明示，AI 產出**不會**自動認定可發布。`books/peterpan-sticker-pilot/approved-rights-sample.json` 為可核准的審核樣本。Secret scan 掃過 `src/`、`schemas/`、`books/`、`tests/`、兩個入口 HTML，未發現任何 API key／token／私鑰。**事實限制：這是「外部結構化草稿」的驗證／匯入／簽認契約，不是瀏覽器內直接呼叫模型的管線**（見「未做／刻意不做的部分」） |
| AC-010 | 舊書與存檔回歸 | **Pass** | `legacy-check.js` 16/16：index／peterpan／sticker-demo 三入口仍正常渲染；4 個舊 key 進度未被清除；新 v1 key 未被舊頁面寫入 |
| AC-011 | 兒童觸控、鍵盤與響應式 | **Blocked** | 僅有 headless Chrome 的 390×844 模擬截圖與鍵盤翻頁／Escape 測試。**無 iPhone／iPadOS Safari 實機證據，不得標 Pass** |
| AC-012 | 邊界、資源與安全 | **Pass** | 惡意 SVG（`script`／`onload`／外部參照）全部被拒；`..` 路徑與外部 URL 被拒；同 priority 穩定排序有測試；無 `eval`、無外呼 API、無 `innerHTML` |
| AC-013 | 音訊契約檢查 | **Pass** | 60 個 narration segment，`speakerId`／`locale`／`audioAsset`／`timings` 皆為 nullable typed 欄位；段落可映射到對應 segment |
| AC-014 | 本機構建、部署預覽與版本回滾 | **Pass**（本機） | `tests/rollback-check.js` 16/16：以基準 SHA `6394cde` 的靜態版本掛在同源 `/baseline/`，三個舊入口仍可讀；現行版寫入的新 v1 存檔在回滾與恢復往返後內容完全一致，基準版未刪除也未寫入新 key。部署仍屬獨立授權關卡 |
| AC-015 | 基礎效能與費用界限 | **Pass**（基線已錄） | 實測基線（`tests/artifacts/performance-baseline.json`）：閱讀器載入 91 ms（DOMContentLoaded 49.7 ms）、貼紙放置中位 1.5 ms／最大 5 ms、全書狀態重算每次 0.01 ms、閱讀期網路請求 22 筆全為本機靜態資源且無任何模型／外部端點呼叫、封包合計 91,406 B（book.json 77,843 B＋素材 13,563 B）、編輯器匯入＋ZIP 輸出 32 ms／93,464 B。未設定捏造的硬性門檻 |

### 尚缺證據

- AC-011 需要 iPhone 與 iPadOS Safari 實機測試（型號、OS 版本、錄影）。
- AC-004 的變體是否為「合理的飛行姿勢／施工姿勢」仍屬美術判斷，需人工目視審查。
- AC-009 的權利審核閘門已通過；剩餘的是「瀏覽器內直接呼叫模型產生草稿」的管線（見「未做／刻意不做的部分」）。AC-009 的驗收原文是「一份 AI 產生但權利未確認的草稿」，本次以**外部產生的結構化草稿封包**作為輸入來驗證匯入／檢查／簽認契約，模型端點從未被呼叫。

## 未做／刻意不做的部分

- 未 push、未合併 `main`、未部署、未變更 GitHub Pages／公開權限／網域／Cloudflare。
- 未讀取、未輸出 `~/.openclaw/secrets/model-providers.json`。
- 未新增任何付費套件、API key、外部服務或 CI。
- 未修改既有三套 runtime 與舊 localStorage key。
- 未實作原生 IPA／App／安裝包。
- 未實作「瀏覽器內直接呼叫模型」產生草稿的管線。已實作的是**外部結構化草稿的匯入／驗證／簽認契約**：AI 或 Codex 產生的草稿封包由外部工具寫出，再以 JSON／ZIP 匯入編輯器驗證。編輯器與閱讀器本身不持有金鑰、不呼叫任何模型端點（實測：閱讀期模型端點呼叫數 = 0）。若日後要內建模型呼叫，需另立規格並補上權利審核流程。
- 未提供 TTS 實際音檔（僅提供 typed contract，符合 AC-013「不要求實際 TTS」）。

## 風險

1. **權利未定**（阻擋發布）：原著改寫、繁體中文譯文、插圖美術來源的授權仍為 `pending`，且 `rightsApprovedBy`／`rightsApprovedAt`／`translationCredit` 尚未填寫。AC-009 的發布閘門已實作且對目前封包**保持關閉**——這是預期行為，不是缺陷。
2. **缺實機證據**（阻擋 AC-011）：桌面模擬不等於 iPhone／iPad 實機。
3. **變體品質未經人工目視**：程式層確認「天空位置使用飛行檔」，森林截圖可見施工姿勢，但「是否看起來像合理飛行姿勢」仍屬美術判斷。
4. **規格與實作落差**：`PRODUCT.md` 的部分項目（瀏覽器內模型草稿管線、語音）目前僅有 contract 層實作，尚未達成端到端。
5. **分支未合併 `main`**：成果已 commit 並 push 到 `origin/codex/v1-book-platform`，但尚未合併回 `main`，正式 GitHub Pages 仍跑舊版。合併與部署是獨立授權關卡。

## 下一步

1. 已完成：commit 到 `codex/v1-book-platform`（5 個里程碑 commit）並 push 到 `origin/codex/v1-book-platform`。**下一步：合併回 `main` 與部署仍需另外授權。**
2. 交由使用者在 iPhone 與 iPad 上執行 AC-011 實機測試。
3. 進行 AC-004 變體人工目視審查與權利審核（人工核准後才可產出出版候選封包）。
4. 若要內建模型草稿管線（AC-009 剩餘項），需另立規格、權利審核流程與金鑰管理方案；現階段維持「外部草稿 → 匯入 → 驗證 → 人工簽認」的路徑。
5. 完成後帶回 EW AI Coding 繼續驗收／預覽／授權發布。

## 重現步驟

```bash
cd ~/Projects/picturebook-puzzle
git checkout codex/v1-book-platform
python3 -m http.server 8791        # 另開終端

node scripts/build-pilot-book.js
node scripts/build-approval-sample.js
node scripts/validate_book.js books/peterpan-sticker-pilot/book.json
node scripts/validate_book.js books/peterpan-sticker-pilot/approved-rights-sample.json
node tests/run-tests.js
node tests/browser-check.js http://127.0.0.1:8791/reader-pilot.html
node tests/editor-check.js  http://127.0.0.1:8791/editor.html
node tests/legacy-check.js  http://127.0.0.1:8791
node tests/performance-check.js http://127.0.0.1:8791/reader-pilot.html http://127.0.0.1:8791/editor.html

# AC-014 回滾對照：基準版必須掛在同源路徑下
mkdir -p /tmp/pbp-rollback-6394cde
git archive 6394cde7dcf1dfb02775885a7ade787b6960d515 | tar -x -C /tmp/pbp-rollback-6394cde
node tests/rollback-server.js 8792 /tmp/pbp-rollback-6394cde   # 另開終端
node tests/rollback-check.js http://127.0.0.1:8792 http://127.0.0.1:8792/baseline
```

入口：

- 共用閱讀器：<http://127.0.0.1:8791/reader-pilot.html>
- 製書編輯器：<http://127.0.0.1:8791/editor.html>
- 舊入口（未改動）：`index.html`、`peterpan.html`、`sticker-demo.html`
