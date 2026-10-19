# 月光森林｜故事拼圖

原創的雷頓式互動繪本 Web 遊戲 MVP。三頁故事、六張可重複使用貼紙，支持拖曳／點選、文字變化、逐頁解謎、localStorage 進度保存。

## 執行

直接開啟 `index.html`，或在此目錄執行：

```sh
python3 -m http.server 8765
```

然後開啟 http://localhost:8765 。手機在同一區域網路可使用 Mac mini 的 LAN IP 連線（如果防火牆允許）。

不依賴 npm、框架、網路服務或第三方素材。

## 解答（測試用）
1. 小女孩 + 提燈
2. 貓頭鷹 + 金鑰匙
3. 小女孩 + 故事書

## 範圍
這是獨立原創小遊戲，不包含任何《雷頓教授》原版素材。未部署至公開網站。

## Agnes 繪本插畫產生器（僅 Mac mini 本機）

直接沿用 `~/.openclaw/secrets/model-providers.json` 裡的 `agnes` 金鑰；不需複製金鑰到此專案。也可透過 `PICTUREBOOK_AGNES_API_KEY` 環境變數覆蓋（`.env.local` 不會自動載入）。

```bash
cd ~/Projects/picturebook-puzzle
python3 scripts/agnes_draw.py --prompt "An empty moonlit woodland clearing with glowing fireflies, painterly storybook background" --name forest-background --size 1024x768
python3 scripts/agnes_draw.py --prompt "A friendly little fox, full-body isolated illustration on a plain background" --name fox --size 1024x1024
```

執行後會呼叫 Agnes API，可能消耗 API 額度，圖片保存在 `art-drafts/`（已加入 `.gitignore`）。腳本**不會自動更新遊戲素材或推送 GitHub**；先檢查生成圖，再自行挑選、去背並移入 `assets/`。此指令為開發工具，並非公開網站的即時繪圖功能。
