# AGENTS.md — Codex 專案執行規則

> 僅適用 `WildenChen/picturebook-puzzle` 的互動童書 v1.0 重構。**本文件是審閱草案；未經使用者確認不得執行寫入。**

## 必讀順序

`PRODUCT.md` → `ARCHITECTURE.md` → `ACCEPTANCE.md` → 本 `AGENTS.md` → `START_CODEX.md` → 現有 README／實際原始碼。首回合僅調查及提出變更計畫，不改程式。

## 專案與交付

- 既有 public GitHub Pages 靜態閱讀器；macOS Apple Silicon 本機製書。第一版要新增共用讀取引擎、第四本三頁 Book Package、視覺化製書工具、AI 草稿匯入驗證、未來語音的 typed contract。
- **必須保留**兩版《月光森林》、24 頁《彼得潘》和原第四本閱讀路徑及舊 localStorage；不應直接以新 runtime 覆蓋既有 `app.js`／`peterpan/reader.js`／`sticker-demo/reader.js`。
- 輸出：可本機預覽、可驗證、可匯出的靜態網站／Book Package。首版不製作原生 IPA／App／安裝包，不需簽名公證。

## 專案地圖

- `index.html`, `app.js`, `style.css`：書架＋兩版月光森林。
- `peterpan.html`, `peterpan/`：24 頁原版。
- `sticker-demo.html`, `sticker-demo/`：3 頁試作，含 SVG、`PETER_SCENE_ROLES`／`PETER_ROLE_VARIANTS`、跨頁故事引擎驗證樣本。
- `scripts/agnes_draw.py`：本機美術製作；`~/.openclaw/secrets/model-providers.json` 是私密資料，**不得開啟後輸出、提交、拷貝到 repository**。
- 建議 `src/core`, `src/editor`, `src/player`, `schemas`, `books` 為新目錄；實作前先批准。

## 已知執行與檢查命令

```bash
cd ~/Projects/picturebook-puzzle
git status --short --branch
python3 -m http.server 8765
node --check app.js
node --check peterpan/reader.js
node --check sticker-demo/reader.js
git diff --check
```

以上是**現有可行的基本命令**；新 build、schema validator、E2E 的命令與依賴：**待 Codex 先行確認，不可憑空捏造**。

## 工程與安全規則

- 第一次回合只能讀與提方案；未獲准不可編輯、刪除、移動、推送或部署。
- 使用新 branch、小型可檢查里程碑；禁止覆寫 `main`，不得自行改正式 GitHub Pages、公開權限、登入、網域、Cloudflare。
- 規則需確定性、可測試，不用 `eval`、任意 JS 條件、AI runtime；文字使用安全 DOM，不直接插入不可信 HTML。
- 貼紙框依 slot 決定，任何 ID／正誤尺寸不變；天空角色有飛行素材，素材缺失應回報。
- `Book Package` 必有 schema、驗證器、測試樣本、權利與來源 metadata、朗讀 segment contract。
- AI 僅能提供製書草稿；人工核准後才能產出出版候選封包。兒童網站不持有金鑰、不收集個資。
- 現有存檔必須可回退；不要用同一 storage key 儲存與舊格式不相容的值。
- 不允許未授權的套件付費、API 使用、密鑰連線、不可逆資料操作或新對外服務。

## 最小垂直切片

先讓**第四本第 1 頁**由新 manifest + engine 正常展示、貼紙、正文切換並保持大小一致；再完成第 2／3 頁、事件與跨頁狀態，接著建立最小編輯器的「匯入→改詞／移框／變體→即時預覽→匯出→重新匯入」。最後全 15 項驗收與舊書回歸。

## Definition of Done

有乾淨可重現的靜態 build、schema/validation、共用引擎、完整三頁／36 放置組合回歸、至少 10 個事件及 1 條跨頁因果、編輯器 round-trip、字幕／朗讀 metadata、存檔相容、基本 accessibility、實際測試紀錄，且所有未測試／失敗項明示；**不包括自行發布正式版**。

## 強制停止

遇到規格衝突、要更換 hosting／框架、需帳密／付費資源、需變更正式服務、權利不明內容、新版會破壞舊存檔或刪改舊書、資料安全缺口，**停止並回報，等授權**。

里程碑後更新 `PROJECT_STATUS.md`（實作時新增），記錄 SHA、已做、已測、未測、證據、風險與下一步。未授權前只保留本機分支／草案，不 push。完成後帶回 EW AI Coding 繼續驗收／預覽／授權發布。
