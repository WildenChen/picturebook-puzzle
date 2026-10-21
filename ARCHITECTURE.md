# ARCHITECTURE.md — 經典童書互動畫冊 v1.0

- 狀態：審閱草案；依 `PRODUCT.md` v1.0。
- 基準：`WildenChen/picturebook-puzzle`，起始參考 `6394cde`；實作前重新驗證 HEAD。

## 1. 原則、邊界、決策

採 **static-first、schema-first、deterministic-first、migration-first**。維持 GitHub Pages 閱讀器、macOS 本機製書，純前端 runtime 負責互動；Codex 與 Agnes 只在內容製作／審核階段使用。平台 MVP 不引入公開可寫後台、使用者登入、資料庫、私密 API key 或即時生成模型。編輯器不直接覆寫遠端 repository；下載封包後進入 Git 審查程序。

現有三種入口：`index.html` + `app.js`（兩版月光森林）、`peterpan.html` + `peterpan/reader.js`（24 頁）、`sticker-demo.html` + `sticker-demo/reader.js`（3 頁）。**禁止先將三者合併、覆寫或刪除**。先建共用引擎，以第四本做新 runtime 的 shadow／candidate 預覽；原入口直到驗收核准才切換。

## 2. 系統邊界和模組

```text
原著（需權利審查） → AI/Codex 製書草稿 + Agnes/人工美術
                                 ↓
                         Book Package + validator
                                 ↕
               本機 Editor（書籍、畫布、事件、文字、預覽）
                                 ↓ 匯出／審核
                  Shared Reader Runtime（靜態資源）
                     ↓ GitHub Pages（另行授權）
            手機／平板／桌面：貼紙、劇情、存檔
```

建議新目錄（實作時可在首次計畫中調整，不必依此硬搬）：

```text
src/core/              schema-adapter, state, rule-evaluator, scene resolver
src/player/            book loader, UI, keyboard/touch, save adapter
src/editor/            book importer, authoring UI, live preview, export
src/shared/            schema and pure validators
schemas/book.schema.json
books/sticker-pilot/    manifest, scenes, stickers, events, texts, audio slots
scripts/               validate books, optional build/export
legacy/                不搬移既有檔案；僅代表相容測試區的概念
```

- **Shared Reader**：依 `bookId`／manifest 讀資料，路由頁面、貼紙庫、段落與進度；不包含特定作品內容硬編碼。
- **Layout/Scene**：固定 4:3 座標（百分比）和每個 slot 的 `role`，標準透明貼紙盒（例如 200×260 素材畫布）保留 `contain`。可選裝飾動畫但不得改變標準碰撞／放置框。
- **Variant Resolver**：按 `stickerId + sceneRole + eventId` 找可用變體；找不到時回退至當場景通用／default，並在製書驗證報告提示。不得由 correct/incorrect 分支決定尺寸。
- **Rule Evaluator**：純函式，輸入既有可重播動作與所有頁面放置，按明確優先序評估每頁事件，回傳 `eventId / stateDeltas / visualState / narrativeVariant / feedback`。不在回呼裡直接改 DOM 或永久資料。
- **Narrative Renderer**：按段落和 token id 使用安全 DOM/text node 插入，避免從 AI 草稿直接插 `innerHTML`；變化可以覆蓋段落，但保留段落穩定 ID。
- **Editor**：載入封包到記憶體；編輯 metadata、段落、slot role/frame、variant、規則的有限條件集合；立即驗證與模擬所有放置；**匯出文件，不寫入 GitHub Pages**。
- **Validation/Export**：schema、必需檔案、相對路徑、安全路徑（不可 `../` 脫離封包）、素材尺寸與 alpha、未覆蓋的規則、段落 token 與 localization、權利記錄。

## 3. Book Package v1 格式與範例

建議採 JSON Schema 2020-12 或現有環境易支援的相近版本；schema 定義不得由 AI 自由擴展未知可執行欄位。示意（正式 schema 必須明列 required、限制、引用與版本）：

```json
{
  "schemaVersion": "1.0.0",
  "bookId": "peterpan-sticker-pilot",
  "title": { "zh-Hant": "彼得潘｜貼紙童話試作" },
  "source": { "author": "J. M. Barrie", "work": "Peter and Wendy", "edition": "1911", "rightsReview": "pending" },
  "artStyleId": "cozy-sticker-v1",
  "chapters": [{ "id": "ch1", "pageIds": ["p1", "p2", "p3"] }],
  "stickers": [{ "id": "peter", "label": {"zh-Hant":"彼得潘"}, "defaultAsset": "assets/peter.svg", "variants": {"sky-flyer": "assets/peter-flying.svg"} }],
  "pages": [{
    "id": "p2", "chapterId": "ch1", "sceneAsset": "assets/sky.svg",
    "slots": [
      {"id":"hero", "role":"sky-flyer", "frame":{"left":28,"bottom":22,"width":22,"height":39},"hint":{"zh-Hant":"一位會飛的男孩"}},
      {"id":"magic", "role":"sky-magic", "frame":{"left":58,"bottom":21,"width":15,"height":27},"hint":{"zh-Hant":"一瓶會發光的魔法"}}
    ],
    "paragraphs": [{"id":"p2-t1","parts":[{"type":"text","value":"星空裡，"},{"type":"slot","slotId":"hero"},{"type":"text","value":"準備出發。"}]}],
    "ruleIds": ["p2-peter-dust", "p2-generic"]
  }],
  "rules": [{"id":"p2-peter-dust", "pageId":"p2", "priority":100,"when":{"all":[{"slotEquals":["hero","peter"]},{"slotEquals":["magic","dust"]}]},"then":{"eventId":"takes-flight","setFacts":{"flewWithPixieDust":true},"narrativeId":"p2-success","variantOverrides":{"hero":"sky-flyer","magic":"sky-magic"}}}],
  "narratives": [{"id":"p2-success","paragraphIds":["p2-t1"]}],
  "narration": {"version":1,"segments":[{"id":"p2-t1","paragraphId":"p2-t1","speakerId":"narrator","spokenText":null,"audioAsset":null,"timings":null}]}
}
```

更嚴格的實作須明確 `paragraphs`／`narratives` 如何選擇，防止事件覆蓋文本後 token 不一致；內文保留可插槽 token，不允許任意腳本。圖片、音訊資源使用封包內相對路徑；每個條目有 provenance／rights metadata（作者、來源、授權、審核狀態）。

## 4. 確定性規則與跨頁重算

1. 使用者動作（放、移、取、翻頁、重玩）先更新**唯一權威的 placements**。
2. 規則按 `chapterOrder/pageOrder → priority 降序 → ruleId 升序` 評估；優先匹配一條 main event，允許分離的非互斥 decoration 規則（明確分組），避免衝突。
3. 從頭重播事件推導 `facts`；facts 為**派生資料**，不可和過期事件混存為第二真相來源。
4. 上頁被修改時，重新計算受影響的後續頁面，消除已失效的成就／狀態；保留合法進度與閱讀位置。改寫錯誤組合亦能顯示合理 fallback。
5. 定義優先順序與 tie-break，避免規則順序隨 JSON 排序而變；同一份 placements 無論重開、回放結果都相同。
6. 結果包含 selected image variant、pose、文案、狀態、反應；視圖只讀結果並渲染。行為規則不得使用 `eval`、任意 JavaScript 或外部 API。

建議提供**事件追蹤預覽**（開發者可見，兒童頁不顯示），例如 `p1-shadowRecovered → p2-flyResponse`；未符合前置條件的第二頁以獨立 fallback 呈現，而非阻止孩子閱讀。

## 5. 音訊契約（預留而不實作播放）

每個段落和對話有穩定 `segmentId`；保存顯示文本與可選 `spokenText`、`speakerId`、`audioAsset`、`locale`、`timings` 欄位。若故事事件改變段落，朗讀引用**最終選出的 narrative variant**，不可對錯版本播放。MVP 驗證資料存在且正確引用；播放控制、TTS provider、音訊產生／快取、逐字時間戳生成在後續階段才加入。

## 6. 製書器與資料安全

- 編輯器為 macOS 本機優先的 Web UI，透過本機 HTTP server 執行；讀入使用者指定的 JSON+素材資料夾或 ZIP（先確認 Safari/Chrome 能力）並在 UI 中編輯。若瀏覽器無法讀取資料夾，最小版本接受 ZIP 匯入／ZIP 匯出。
- **無任何遠端可寫 API 或帳密**；API Key 僅開發 Mac mini 本地 `.env` 或既有 secret store。製書流程以受控輸入檔案與輸出封包為界，瀏覽器不直接握有模型 credentials。
- 編輯器使用本機瀏覽器，不存放兒童個人資訊。製書者編輯草稿的暫存若使用 IndexedDB/localStorage，必須提供顯式匯出與放棄修改提示；正式權威資料以匯出檔為準。
- 讀者進度只存瀏覽器本機，書籍前綴與 storage schema 可版本化。保留既有 localStorage key；新 pilot 使用新 key，或經核准後提供**純讀取、可回滾的明確遷移**；不在第一版自動覆蓋。
- 不允許匯入含 script、event handler 或外部網域引用的未信任 SVG；最保守方式將 SVG 當圖片使用並驗證；嚴格拒絕非白名單 asset URI、HTML／JS 注入。

## 7. 建置、平台與部署

- 目標：macOS Mac mini (Apple Silicon，現有環境)、Chrome／Safari 開發與預覽；iOS Safari／iPadOS Safari／Chrome 桌面閱讀。**不要求原生打包／簽名／公證**。
- 現有讀取命令：`python3 -m http.server 8765`（以 repository root 為 cwd），`node --check app.js` 和 `node --check sticker-demo/reader.js`。新共用引擎／schema / editor 的 build/test 命令需在 Codex 首回合盤點後確定；不可假稱現有 npm script 已存在。
- 可採用小型 build 依賴以支持 schema 驗證及 UI 自動測試，須先在首次施工計畫說明套件與授權；避免無必要的前端框架遷移。
- build 輸出為普通 HTML/CSS/JS/JSON/SVG/WebP 靜態資料，GitHub Pages 相對路徑與 Jekyll `build_revision` cache busting 的現有邏輯應保持可用。
- 建議 CI（新建，非現有）：JSON schema 驗證、asset/reference check、DOM unit／scenario test、Chrome E2E（桌面＋窄螢幕），以及 legacy smoke checks。

## 8. 備份、回滾和版本管理

建立 Codex 專用 branch（名稱由首次計畫提出），不直接改動／合併 `main`。記錄起始 SHA、測試產物與 screenshot；每個 milestone 可在獲授權的 branch 建 commit。保留目前四本與資產原路徑；切換第四本閱讀器前產生最小可回滾版本。新存檔以獨立 key 為主，支援 export/import；要更換資料 schema 才進行明示遷移。正式發布或改變網址、權限、Cloudflare 設定，都要新的使用者同意。

## 9. 風險與待決策

- **最重要的風險：美術一致性**。需提供 stage slot 的美術驗證檢查與實際人工視覺審核，schema 正確不代表圖像美觀。
- **跨頁規則**可能變成複雜腳本：v1 限制有限 DSL、排序與事件追蹤。
- **瀏覽器匯入/匯出**：Chrome 與 Safari 對資料夾系統 API 不同；第一版以 ZIP 作為可攜保底方案，選定 zip library 需在施工計畫確認。
- **適齡、版權、翻譯**：每書必須人工審查，特別是現代譯本與知名影視造型。
- **生產部署**：現有 GitHub Pages 已公開，不能把新編輯器和包含未審稿內容的草稿誤上傳公開根目錄。
- **語音**：API 與格式先做好，不提早選 TTS 廠商及引入雲端費用。
