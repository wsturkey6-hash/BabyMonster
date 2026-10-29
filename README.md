# BabyMonster

給新手爸媽的寶寶日常紀錄 App：餵奶、大小便、睡眠、體溫、身高體重頭圍、疫苗。
介面是繁體中文，主要在 iPhone 上以「加入主畫面」的網頁 App（PWA）使用，沒網路也能記錄。

## 功能

- **記錄**：餵奶量、大便（顏色卡、量、布里斯托分類）、小便、入睡／起床、體溫、體重、身高、頭圍、備註
- **統計**：每日的次數、總量、睡眠時長與奶量目標；日常指標的趨勢圖；依 WHO 兒童生長標準畫出的生長曲線與百分位
- **副食品**：記錄吃了哪些食材、份量與反應；試敏表列出 4～10 個月的 118 項食材與建議順序，標出未嘗試／已嘗試／有反應
- **疫苗**：依接種時程記錄每一劑的施打日期
- **多寶寶**：同一支手機可以記錄好幾個寶寶
- **兩位家長共用同一份資料**：選配的同步伺服器，見下方「同步」
- **匯出／匯入 JSON 備份**（也能匯入已停止維護的 iOS 原生版匯出檔）

## 專案結構

| 目錄 | 內容 |
|---|---|
| `web/` | 網頁版（React 18 + TypeScript + Vite + Dexie／IndexedDB，PWA） |
| `web/functions/` | Cloudflare Pages Function：驗證登入後把同步請求轉給家裡的伺服器 |
| `server/` | 同步伺服器（Node 22 + Hono + SQLite），以 Docker 執行 |
| `shared/` | 網頁與伺服器共用的資料驗證規則 |
| `data/`、`scripts/` | WHO 生長標準資料與產生程式 |
| `docs/` | 各功能的設計文件與實作計畫 |

## 開發

```bash
cd web
npm ci
npm run dev        # 本機開發
npm test           # 單元測試
npm run build      # 產出 web/dist
```

```bash
cd server
npm ci
npm test
```

## 同步（選配）

不設定同步時，資料只存在各自手機的瀏覽器裡，彼此用 JSON 匯出匯入交換。

設定同步之後，兩支手機會在幾秒內看到同一份紀錄，離線時照常記錄，連上線再補傳：

```
手機（PWA）
  → Cloudflare Access（只放行指定的 Email）
  → Cloudflare Pages（靜態網頁 + web/functions 的 Pages Function）
  → Cloudflare Tunnel + 第二層 Access（只接受 service token）
  → 家裡的伺服器（server/，一個 SQLite 檔）
```

- 衝突以「最後寫入者勝」解決；伺服器會把每支手機的時間校正到伺服器的時鐘，手機時鐘不準也不會亂掉
- Pages Function 只信任驗證過的 Access JWT（`aud` 綁定保護網頁的那個 Access 應用程式），只轉送兩個固定的 API 路徑
- 所有網址、金鑰都從環境變數讀取，repo 裡不含任何主機名稱或密碼

Pages Function 需要的六個環境變數見 `web/functions/api/[[path]].ts` 的 `Env`；
伺服器需要 `PROXY_SECRET`（執行時環境變數，至少 16 字元）與 `DB_PATH`。
Secret 類的值只設在 Production 環境，Preview 環境一個都不要設。

## 授權

- 程式碼：MIT License，見 [LICENSE](LICENSE)
- 字型（`web/public/fonts/`）：Fredoka、Nunito、Huninn，皆為 SIL Open Font License 1.1，授權檔在同一個目錄
- 生長曲線參考值取自 WHO Child Growth Standards (2006)

本 App 只是紀錄工具，不提供醫療建議；寶寶的健康狀況請諮詢醫師。
