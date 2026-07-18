# BabyMonster 網頁版 — 設計文件（Spec）

- 日期：2026-07-18
- 狀態：設計已核可，待使用者審閱本文件
- 平台：Web（純前端 PWA）
- 相關文件：`2026-07-14-babymonster-design.md`（iOS MVP）、`2026-07-16-multi-baby-design.md`（多寶寶 v2）

## 1. 目標與動機

太太不想在 iPhone 開開發者模式側載、也不想每 7 天重裝 App。做一個**功能與 iOS 版一致**的網頁版：Safari 開網址 →「加入主畫面」後即為 PWA — 全螢幕、有圖示、離線可用、資料持久保存，永遠不會過期。

第一版**直接內建多寶寶功能**（依 2026-07-16 多寶寶 spec），匯出 v2 格式、可匯入 v1 舊檔。

## 2. 範圍決策（已確認）

- **純前端 PWA**：無後端、無帳號；資料存瀏覽器 IndexedDB，不上雲。
- **多寶寶 v2 直接進第一版**：行為完全依多寶寶 spec（切換器、過濾、寶寶管理、v2 匯出、v1 匯入相容）。
- **與 iOS 版雙向相容為目標**（使用者尚未決定誰用哪版，保守處理）：
  - 現行 iOS v1 匯出檔 → 網頁版**可直接匯入**。
  - 網頁版 v2 匯出檔 → 需等 iOS 升級多寶寶版才能匯入（已知限制，使用者已接受；多寶寶 spec §2 同此限制）。
- **部署**：GitHub Pages，同一 repo（已公開），`web/` 子資料夾，GitHub Actions 自動部署。
- **技術棧**：React + TypeScript + Vite。
- **UI 資訊架構沿用 iOS 版**：4 分頁、中文介面、行動優先。

## 3. 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| UI | React 18+ + TypeScript | 4 分頁用簡單 state，不需 router |
| 建置 | Vite | `base: '/BabyMonster/'`（GitHub Pages 路徑） |
| 儲存 | IndexedDB via Dexie | 測試用 fake-indexeddb |
| 圖表 | Recharts | 趨勢折線圖 |
| PWA | vite-plugin-pwa | manifest + service worker 離線快取 |
| 測試 | Vitest | 純邏輯層 TDD |
| 部署 | GitHub Actions → GitHub Pages | push main 自動部署 `web/` |

- 目標瀏覽器：iOS Safari 16+、現代 Chrome/Edge。不支援舊瀏覽器。
- 啟動時呼叫 `navigator.storage.persist()` 申請持久儲存，降低被清除風險。
- PWA manifest：名稱 BabyMonster、`display: standalone`、中文、自製簡單圖示（含 apple-touch-icon）。
- 部署網址：`https://wsturkey6-hash.github.io/BabyMonster/`。

## 4. 目錄結構（鏡射 iOS 分層）

```
web/
  index.html
  vite.config.ts
  package.json
  public/                    # 圖示等靜態資源
  src/
    logic/                   # 純函式層（TDD，無 DOM / 無 Dexie 依賴）
      types.ts               # ProfileData / RecordData / enums
      stoolColorCard.ts      # 1–9 色卡 + isAbnormalStoolColor
      dailyStats.ts          # 每日統計
      babyAge.ts             # 年齡（歲/月/天）
      trendSeries.ts         # 趨勢資料序列
      dataTransfer.ts        # v1/v2 編解碼 + 合併（含 babyId 重對映）
    db/
      db.ts                  # Dexie schema
      repository.ts          # CRUD + 匯入合併 transaction + currentBabyId
    ui/
      App.tsx                # tab 切換 + 全域狀態
      RecordPage.tsx         # 記錄
      DailyStatsPage.tsx     # 每日統計
      TrendPage.tsx          # 趨勢
      SettingsPage.tsx       # 設定
      BabySwitcher.tsx       # 寶寶切換器
      components/            # 表單元件、色卡、toast 等
  tests/                     # Vitest（對應 logic/ 每個模組）
.github/workflows/deploy-web.yml
```

## 5. 資料模型與儲存

### 5.1 型別（與 iOS 一一對應）

```ts
type StoolAmount = 'few' | 'medium' | 'many';   // 與 Swift rawValue 一致
type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface ProfileData {
  id: string;          // UUID
  name: string;        // 預設 "BabyMonster"
  birthDate: number;   // epoch ms（內部表示）
}

interface RecordData {
  id: string;          // UUID
  babyId: string;      // UUID
  timestamp: number;   // epoch ms（內部表示）
  feedAmount?: number; // ml
  stoolColor?: number; // 1–9
  stoolAmount?: StoolAmount;
  stoolShape?: BristolType;
  hasUrine: boolean;
  temperature?: number; // °C
  weight?: number;      // g
  note?: string;
}
```

- **內部時間一律 epoch ms**（number，排序與索引穩定）；只在匯出/匯入時與 ISO 8601 字串互轉。
- 「一天」= 裝置當地時區 00:00:00–23:59:59，與 iOS 一致。
- UUID 以 `crypto.randomUUID()` 產生（小寫；Swift `UUID(uuidString:)` 不分大小寫，互通無虞）。

### 5.2 Dexie schema

```ts
// db 名稱：babymonster
profiles: 'id'                       // 主鍵 id
records:  'id, babyId, timestamp'    // 主鍵 id，索引 babyId、timestamp
```

### 5.3 當前寶寶（依多寶寶 spec §5）

- `localStorage['currentBabyId']` 儲存 UUID 字串（對應 iOS `@AppStorage`）。
- 解析：找不到對應寶寶 → 退回第一個寶寶；完全沒有寶寶 → nil。
- 無寶寶時儲存記錄 → 自動建立預設寶寶「BabyMonster」（生日 = 今天）並綁定，流程不中斷。
- 記錄/統計/趨勢三頁一律過濾 `babyId === 當前寶寶.id`；新記錄綁定當前寶寶。

## 6. 統計 / 年齡 / 色卡 / 布里斯托（沿用 iOS 定義）

- **每日統計**（`dailyStats.ts` 純函式）：大便次數（`stoolColor != null` 筆數）、小便次數（`hasUrine` 筆數）、總喝奶量（加總）、平均體溫、平均體重（無資料顯示「—」）。
- **年齡**（`babyAge.ts`）：X 歲 X 個月又 X 天；語意對齊 Swift `Calendar.dateComponents([.year, .month, .day], from:to:)`（先算整年、再整月、餘數為天；跨月/月底/生日當天邊界以測試對齊 iOS 既有測試案例）。
- **大便卡**：1–9 號近似色塊；`isAbnormalStoolColor(n) = 1 <= n <= 6`；選 1–6 顯示異常提醒；標註「實體大便卡為最終判讀依據」。
- **布里斯托 1–7 型**：沿用 iOS displayName 文案與「新生兒/母乳寶寶偏軟屬正常」附註。
- **趨勢**（`trendSeries.ts`）：7 / 14 / 30 / 自訂天數 × 5 指標（大便次數、小便次數、總喝奶量、平均體溫、平均體重）的逐日序列。與 iOS `TrendSeries` 行為一致：每一天都產生一個資料點；大便/小便次數與總喝奶量在無資料日為 **0**，平均體溫/體重在無資料日為 **null**（折線圖呈現斷點）。

## 7. 匯出 / 匯入（相容性核心）

### 7.1 v2 匯出格式（與多寶寶 spec §7.1 一致）

```json
{
  "version": 2,
  "profiles": [ { "id": "...", "name": "...", "birthDate": "2025-11-02T00:00:00Z" } ],
  "records":  [ { "id": "...", "babyId": "...", "timestamp": "2026-07-18T04:56:00Z",
                  "feedAmount": 120, "hasUrine": true, "...": "..." } ]
}
```

**編碼硬規則（保證未來 iOS v2 的 Swift `JSONDecoder(.iso8601)` 讀得了）：**

1. 日期 = **ISO 8601 UTC、秒級精度、無毫秒**：`YYYY-MM-DDTHH:mm:ssZ`。JS `Date.toISOString()` 預設帶毫秒（`.789Z`），Swift `.iso8601` 會解碼失敗 — 必須去除毫秒，並有專門單元測試把關。
2. 值為 undefined/null 的選填欄位**整個省略**（對齊 Swift `encodeIfPresent`）。
3. `stoolAmount` 編碼為 `"few" | "medium" | "many"` 字串；`stoolShape` 編碼為整數 1–7。
4. `hasUrine` 永遠存在（boolean）。
5. 物件鍵排序輸出（對齊 iOS `.sortedKeys`，非必要但利於 diff）。

### 7.2 匯入（寬進嚴出）

- 解碼順序：有 `version: 2` 與 `profiles` 鍵 → v2；否則試 v1 `{ profile, records }`（現行 iOS 匯出檔）。都失敗 → 明確錯誤訊息。
- 日期解析接受含毫秒或不含毫秒的 ISO 8601；UUID 不分大小寫。
- 逐筆驗證：必要欄位存在、`stoolColor` 1–9、`stoolShape` 1–7、`stoolAmount` 合法值、數值欄位為數字；任一筆不合法 → 整檔拒絕（不部分匯入）。

### 7.3 合併規則（與多寶寶 spec §7.3–7.4 一致）

對每個進來的寶寶：id 對中 → 同一寶寶（保留本機名字/生日）；id 沒中 → 名字完全相同 → 同一寶寶並把其記錄 `babyId` **重對映**；都沒中 → 新建。
v1 檔：其 profile 無 id → 直接進名字比對；其 records 全部綁定該寶寶後走一般合併。
記錄合併：以 record `id` 聯集去重、重複 id 保留本機、依 timestamp 排序。重對映在去重之前。

### 7.4 介面

- **匯出**：設定頁選範圍 —「全部寶寶」（預設）或個別寶寶。優先 Web Share API 分享檔案（iOS Safari 可直接傳 LINE）；不支援（如桌面瀏覽器）則下載檔案。檔名：全部 `BabyMonster-YYYYMMDD.json`、單寶 `BabyMonster-{名字}-YYYYMMDD.json`。
- **匯入**：`<input type="file" accept=".json,application/json">` 選檔。

### 7.5 已知限制

（2026-07-18 更新）iOS 多寶寶 v2 已完成並合併進 main（PR #3），兩版皆為 v2、可完整雙向互傳。唯一殘餘限制：仍裝著舊 v1 版 iOS App 的手機讀不了 v2 匯出檔 — 更新 App 即解。

## 8. 畫面（4 分頁、行動優先、中文）

底部 tab bar（拇指易達），處理 `safe-area-inset`（瀏海與底部指示條）。

1. **記錄**：頂部當前寶寶名字＋年齡列＋寶寶切換器（Menu 列出所有寶寶）；快速輸入表單（喝奶量、大便卡 1–9 色塊、大便量、布里斯托、小便開關、體溫、體重、備註 — 全選填）；選 1–6 號顯示異常提醒；今日記錄時間軸，可點入編輯/刪除。
2. **每日統計**：日期選擇 + 當天 5 項摘要；含寶寶切換器。
3. **趨勢**：天數（7/14/30/自訂）× 指標（5 項）折線圖（Recharts）；含寶寶切換器。
4. **設定**：寶寶清單（每列名字＋年齡，點入編輯；新增寶寶；刪除需確認框載明「將一併刪除『{名字}』的 {N} 筆記錄」，連動刪除該寶寶全部記錄）；匯出（範圍選擇）；匯入。

無寶寶狀態：切換器隱藏、統計/趨勢顯示空狀態；首次儲存記錄自動建預設寶寶（§5.3）。

## 9. 錯誤處理

- 匯入：先完整解析＋逐筆驗證，全部通過才寫入；合併寫入包在**單一 Dexie transaction**，失敗全回滾、現有資料不動；錯誤以中文 toast 呈現（格式錯誤/欄位不合法/讀檔失敗分開訊息）。
- IndexedDB 寫入失敗（配額/私密瀏覽限制）→ toast 提示。
- 匯出無資料時仍可匯出（空 records），與 iOS 行為一致。

## 10. 測試策略（TDD，鏡射 iOS 27 測試 + 多寶寶測試）

純邏輯層（`src/logic/`）Vitest 覆蓋：

- `dailyStats`：空資料、部分欄位缺值、單日邊界（跨午夜）
- `babyAge`：跨月、月底（1/31 → 2/28）、生日當天、對齊 iOS 既有測試案例
- `stoolColorCard`：異常判定邊界（6 = 異常、7 = 正常）
- `trendSeries`：天數視窗、無資料日（次數/喝奶量 = 0；平均體溫/體重 = null）、days ≤ 0 回空陣列
- `dataTransfer`：
  - v2 round-trip（encode → decode 等值）
  - **日期輸出無毫秒、UTC、秒級**（相容性關鍵測試）
  - 選填欄位省略行為
  - v1 檔解碼 → 寶寶歸屬（名字比對/新建）
  - 合併：id 對中、名字對中（babyId 重對映）、全新寶寶、記錄去重本機優先、timestamp 排序
  - 不合法檔案整檔拒絕
- `repository`（fake-indexeddb）：CRUD、匯入 transaction 回滾、刪寶寶連動刪記錄

UI 層保持輕薄不寫元件測試（與 iOS 策略一致）；完成後以瀏覽器（桌面 + 手機模擬 viewport）端對端手動驗收，最終由使用者在 iPhone 實機驗收 PWA 安裝與離線。

## 11. 部署流程

- `.github/workflows/deploy-web.yml`：push 到 `main` 且 `web/**` 有變更 → `npm ci && npm run build`（含 `npm test`）→ 部署 `web/dist` 到 GitHub Pages。
- 首次需在 repo Settings 啟用 GitHub Pages（Source: GitHub Actions）— 由使用者操作或明確同意後代辦。
- 推送 GitHub 仍依專案規則：需使用者逐次明確同意。

## 12. 不做（YAGNI）

- 後端、帳號、雲端/即時同步
- UI 重新設計（沿用 iOS 資訊架構與文案）
- v1 格式匯出（只出 v2，與多寶寶 spec §9 一致）
- 舊瀏覽器支援、i18n、深色模式客製（跟隨系統預設即可）
- 推播提醒、圖片附件、PDF 匯出（同 iOS spec §13）

## 13. 未來可擴充

- iOS 完成多寶寶 v2 後，兩版互傳 v2 檔完整雙向同步
- 自訂網域（換 Cloudflare Pages 或 Pages 綁網域）
- 有需要時再演進為共用後端（本版資料層以 repository 隔離，利於未來替換）
