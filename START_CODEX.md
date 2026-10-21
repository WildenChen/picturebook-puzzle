# START_CODEX.md — 啟動 Codex：經典童書互動畫冊平台 v1.0

> **重要：第一回合只盤點與提案，不得修改程式、素材、書籍、正式網站或 GitHub repository。等我確認你的實作計畫後再開始。**

你正在接手既有 repository：`WildenChen/picturebook-puzzle`。已確認的產品方向是 **C：AI 製書＋視覺化編輯器**，以第四本《彼得潘｜貼紙童話試作》的三頁作為引擎改造與製書流程示範，未來支援多本經典童書。主平台為 Web／靜態 GitHub Pages，本機製書器在 macOS 使用；v1.0 建立音訊資料契約但不強制製作配音。

## 第一回合請務必完成（只能讀）

1. 逐一讀完 `PRODUCT.md`、`ARCHITECTURE.md`、`ACCEPTANCE.md`、`AGENTS.md`，以及本 repository 實際 README、程式、素材、git status／HEAD。
2. 用繁體中文摘要真正目標、MVP、明確不做、交付形式及需要保留的四本既有入口和全部存檔。
3. 核對實際工作環境、macOS／Node／Python／瀏覽器、目前執行／測試指令，標示尚未確認的命令，**不要假設現有 package.json 或 CI**。
4. 評估目前 `app.js`、`peterpan/reader.js`、`sticker-demo/reader.js` 重複程度與共通介面，提出可共用的 Book Package schema、rule DSL、variant resolver、layout、editor 匯入匯出方案（例如 ZIP 備援）。
5. 列出規格矛盾／待決策／主要風險（尤其保存進度、Safari 檔案匯入、SVG 安全、著作權與 GitHub Pages）。
6. 提出**最小垂直切片**與按里程碑的實作順序、每一階段預計新增或修改的檔案、需要的第三方依賴、build/preview 產物以及對應 `ACCEPTANCE.md` 案例。
7. 提出如何建立新 branch、如何驗證舊版、如何回滾和何時請我核准；**本回合不得實際建立 branch 或寫檔**。
8. 最後用「等待批准」結尾，停止操作。

## 待我批准計畫後才可執行

- 按可檢查的短里程碑開發，而不是承諾完成時間；首先交出第 1 頁的可執行新 runtime 和證據，再擴成三頁、跨頁事件、編輯器、validator 與 export。
- 每一重要里程碑 run 實際測試；對所有通過、失敗、阻塞或未測項標出 SHA、版本、結果、證據檔與重現步驟。
- 建立並持續更新 `PROJECT_STATUS.md`，記錄完成項、測試與未測、風險、下一步；不要把 Codex 完工等於已驗收／已發布。
- 僅在**取得 repository 寫入授權**後，提交可還原的 Git milestone；未得到 push／PR 授權前不操作遠端分支或正式網站。
- 發生影響產品定位、框架、資料格式向後相容、需使用憑證或費用、違反素材授權、修改公開存取設定、刪改既有內容等情形時立即停止等待確認。
- 結案回報具體可開啟 build/preview 位置、實際測試矩陣、未通過／未測案例、已知限制與下一個必要的人類決策。提醒我帶回 **EW AI Coding**，依據真實證據繼續驗收、預覽與發布授權流程。

## 成功判準摘要

- 三頁經共用 runtime 呈現；3 頁 × 2 slots × 6 貼紙放置測試。
- 至少 10 種有意義的組合／事件反應；至少 1 條前頁影響後頁並可重算／回滾。
- 場景適配姿態、固定框大小、嵌入式提示文字、無空白貼紙、手機／平板使用性。
- 製書器能以 Book Package 匯入、編輯、預覽、匯出、再次匯入且維持一致。
- 朗讀資料／角色台詞段落契約可驗證，不需要實際 TTS。
- 前三本＋第四本舊路徑與舊 localStorage 不受影響。
- 完整驗收與授權之前不更新正式網站。
