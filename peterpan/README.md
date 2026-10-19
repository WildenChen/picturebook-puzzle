# 彼得潘：永不長大的夢幻島

第三本獨立互動繪本。改編自 J. M. Barrie《Peter and Wendy》（1911）；
6 章、24 頁、每頁兩個可自由放置任何類型貼紙的故事位置。

- `peterpan.html`：獨立閱讀入口（書架第三本）
- `peterpan/data.js`：24 頁繁體中文正文、線索、正解與 31 種貼紙
- `peterpan/reader.js`：章節切換、自由放置、點選／拖曳、答案驗證、
  獨立 localStorage 記錄（`storybook-peterpan-original-v1`）
- `peterpan/reader.css`：桌面雙欄與手機／平板直向適配
- `peterpan/assets/`：Agnes 原創封面、24 張場景、31 張去背角色／道具
- `peterpan/generate_art.py`：Mac mini 本機重新生成素材（呼叫既有 Agnes 私密金鑰）
- `peterpan/matte_sprites.py`：使用原始草稿圖重新去背，保留原始 PNG 於忽略追蹤的 `art-drafts/`

繪圖 API Key 不在 GitHub，也不在此書的前端程式中。需要重繪時，
Mac mini 本機執行 `python3 peterpan/generate_art.py --group scenes` 等指令即可。
不修改《月光森林》兩版的素材與存檔。

閱讀玩法：選貼紙 → 點場景中的任一位置或空格，或直接拖曳。
放錯答案可自由換掉，不限制人物／物件種類；完成一頁後按「檢查這一頁」。
切換章節及離開閱讀器不會消除進度。

改編及美術均為獨立製作，不使用迪士尼電影版角色造型。
公開發行及後續商業用途應自行確認各地《Peter Pan》作品權利要求。


## 內嵌故事提示詞（24 頁）

`peterpan/data.js` 每頁保留 `text` 原始段落，另有 `storyTemplate`，
以 `{slot0}`、`{slot1}` 對應插畫中兩個自由放置區；`slotHints`
是尚未放貼紙時嵌在正文中的提示句。貼紙的 `storyLabel` 可與卡片名稱不同，
以使內文語句自然。

`reader.js` 使用安全 DOM 文字節點渲染：未填時以兩種顏色顯示提示，
放入人物或物品即時更新對應字詞；取下後恢復提示。檢查正確後，
填入的字詞變為綠色。兩個位置均可使用任意貼紙種類，
不改變既有正解、進度儲存 key 或場景素材。

驗證：桌面與手機寬度 Chrome 截圖，以及 24 頁空白、錯誤組合、
取下貼紙、填入正解、完成標記、返回已完成頁面的互動測試。
