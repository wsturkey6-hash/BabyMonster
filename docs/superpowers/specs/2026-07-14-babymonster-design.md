# BabyMonster — 設計文件（Spec）

- 日期：2026-07-14
- 狀態：待使用者審閱
- 平台：iOS App

## 1. 目標

一個給爸媽記錄寶寶每日照護資訊的 iOS App，資料整理成統計與趨勢圖，**供醫生看診時參考**。強調輸入快、資料準、給醫生一目了然。

## 2. 範圍決策（已確認）

- **單一寶寶**：一個 App 記錄一個寶寶（多寶寶為未來擴充，本版不做）。
- **純本機儲存**：無帳號、無雲端後端；用 SwiftData 存在裝置上。
- **手動檔案同步**：匯出 JSON 檔 → 用 LINE 傳給另一半 → 對方 App 匯入合併。
- **統計即時計算**：不依賴背景排程；打開統計/趨勢頁時即時計算。
- **給醫生方式**：App 畫面直接給醫生看（不做 PDF 匯出）。

## 3. 技術棧

- **SwiftUI**（UI）
- **SwiftData**（本機持久化，需 iOS 17+）
- **Swift Charts**（趨勢折線圖）
- **最低支援 iOS 17**
- **XCTest**（單元測試，相容性最廣）
- 專案骨架：以 **XcodeGen**（`project.yml`）生成 `.xcodeproj`；若環境無 XcodeGen 則手寫最小 `pbxproj`。使用者在 Xcode 開啟、跑模擬器或上實機。

## 4. 資料模型（方案 A：單一記錄，欄位皆選填）

```
BabyProfile
  name: String

Record
  id: UUID                       // 匯入合併用的穩定鍵
  timestamp: Date                // 事件發生時間
  feedAmount: Double?            // 喝奶量 (ml)
  stoolColor: Int?               // 大便卡 1–9；有值代表「這筆有大便」
  stoolAmount: StoolAmount?      // 少 / 中 / 多
  stoolShape: BristolType?       // 布里斯托 1–7
  hasUrine: Bool                 // 有無小便（預設 false）
  temperature: Double?           // 體溫 (°C)
  weight: Double?                // 體重 (g，公克)
  note: String?                  // 自由備註
```

- 每筆記錄 = 一個時間點 + 使用者當下想記的東西，各欄位獨立選填。
- 一次可只填喝奶，也可同時填喝奶 + 大便 + 小便。

### 列舉

```
StoolAmount: 少, 中, 多
BristolType: 1, 2, 3, 4, 5, 6, 7
```

## 5. 統計定義（即時計算，一天 = 當地時間 00:00–23:59）

給定某一天的記錄集合 R：

- **大便次數** = R 中 `stoolColor != nil` 的記錄數
- **小便次數** = R 中 `hasUrine == true` 的記錄數
- **總喝奶量** = R 中所有 `feedAmount` 加總（nil 略過）
- **平均體溫** = R 中有填 `temperature` 者的平均（無資料則顯示「—」）
- **平均體重** = R 中有填 `weight` 者的平均（單位：公克 g；無資料則顯示「—」）

實作為純函式 `DailyStats(for date: Date, records: [Record]) -> DailySummary`，方便單元測試。

## 6. 嬰兒大便顏色卡（台灣兒童健康手冊 1–9 號）

- 以 9 個號碼 + 近似色塊供點選。
- **1–6 號 = 異常**（白陶土色系，可能是膽道閉鎖等警訊）→ 選到時在畫面上顯示提醒文字。
- **7–9 號 = 正常**（黃 / 綠 / 棕褐）。
- 色塊顏色為近似值，**實體大便卡為最終判讀依據**；App 內會標註此點。
- 近似色（實作時可再校正，最終以官方卡為準）：

| 號碼 | 類別 | 近似描述 |
|---|---|---|
| 1 | 異常 | 灰白 / 陶土色 |
| 2 | 異常 | 淺灰黃 |
| 3 | 異常 | 淺黃白 |
| 4 | 異常 | 淡黃 |
| 5 | 異常 | 淺黃綠 |
| 6 | 異常 | 淡綠 |
| 7 | 正常 | 黃 |
| 8 | 正常 | 綠 |
| 9 | 正常 | 棕褐 |

判定邏輯為純函式 `isAbnormalStoolColor(_ n: Int) -> Bool { (1...6).contains(n) }`，單元測試覆蓋邊界（6=異常、7=正常）。

## 7. 大便形狀 — 布里斯托大便分類（Bristol Stool Scale）

| Type | 描述 |
|---|---|
| 1 | 一顆顆分離硬塊，像堅果（難排出） |
| 2 | 香腸狀但表面結塊 |
| 3 | 香腸狀，表面有裂痕 |
| 4 | 香腸或蛇狀，光滑柔軟（理想） |
| 5 | 柔軟塊狀，邊緣清楚（易排出） |
| 6 | 蓬鬆糊狀，邊緣不規則 |
| 7 | 水狀，無固體塊（腹瀉） |

附註（顯示於選擇畫面）：新生兒 / 母乳寶寶的便便天生偏軟，常落在 6–7 型，此量表偏成人標準，僅供描述參考。

## 8. 畫面（4 個分頁）

1. **記錄（Home）**
   - 快速輸入表單：喝奶量、大便（顏色卡 1–9 / 量 / 布里斯托形狀）、小便開關、體溫、體重、備註 — 全部選填。
   - 今日記錄時間軸列表，可點入編輯 / 刪除。
   - 大便顏色選到 1–6 時顯示異常提醒。

2. **每日統計**
   - 選擇日期，顯示當天 5 項摘要（大便次數、小便次數、總喝奶量、平均體溫、平均體重）。

3. **趨勢**
   - 選天數：7 / 14 / 30 / 自訂。
   - 選指標：大便次數 / 小便次數 / 總喝奶量 / 平均體溫 / 平均體重。
   - 用 Swift Charts 畫折線圖看趨勢。

4. **設定**
   - 輸入 / 修改寶寶名字。
   - 匯出資料（分享 sheet）、匯入資料（開檔）。

## 9. 匯出 / 匯入（手動同步）

- **匯出**：把 `BabyProfile` + 所有 `Record` 編碼成 JSON，寫成檔案 `BabyMonster-YYYYMMDD.json`，透過系統分享 sheet 傳出（例如 LINE）。
- **匯入**：從 Files / 分享進 App 開啟 JSON，解碼後以 **記錄 `id` 聯集去重** 合併進本機資料庫（已存在的 id 略過，新的加入）。
- **合併策略**：union by `id`。因雙方多半是各自「新增」記錄，聯集即可安全合併。
- **已知限制**：同一 `id` 若兩邊各自編輯過，目前保留本機版本、不做欄位級合併（本版可接受；未來可加 last-modified 時間戳解衝突）。
- 純函式 `mergeRecords(local:incoming:) -> [Record]` 與 JSON `encode/decode` round-trip 皆單元測試。

## 10. 測試策略（TDD + Karpathy）

純邏輯優先做 TDD，UI 層保持輕薄：

- `DailyStats` 統計計算（含空資料、部分欄位缺值）
- `isAbnormalStoolColor` 大便卡正常 / 異常判定（邊界 6 / 7）
- 匯出 / 匯入 JSON round-trip（編碼後解碼等值）
- `mergeRecords` 合併去重（重疊 id 不重複、各自新增皆保留）

## 11. 專案骨架與結構

```
BabyMonster/
  project.yml                    # XcodeGen 設定
  Sources/
    BabyMonsterApp.swift         # App 進入點
    Models/
      BabyProfile.swift
      Record.swift
      Enums.swift                # StoolAmount, BristolType
      StoolColorCard.swift       # 1–9 顏色與異常判定
    Logic/
      DailyStats.swift
      DataTransfer.swift         # 匯出/匯入/合併
    Views/
      RecordView.swift
      DailyStatsView.swift
      TrendView.swift
      SettingsView.swift
      RootTabView.swift
  Tests/
    DailyStatsTests.swift
    StoolColorTests.swift
    DataTransferTests.swift
  docs/superpowers/specs/...      # 本文件
  PROGRESS.md                     # 進度追蹤（持續更新）
  .claude/settings.json           # 專案規則（見 §12）
```

## 12. 專案執行規則

### 12.1 編排模式（Orchestrator）

- **Opus** 負責規劃與調度（orchestrator）。
- 實際實作依任務難度派給 **Sonnet / Haiku** 子代理執行（簡單機械式工作用 Haiku，較複雜邏輯用 Sonnet）。
- 每個實作任務完成後回報，Opus 彙整並更新進度。

### 12.2 進度保存與自動 compact

- `.claude/settings.json` 設定：
  - `autoCompactEnabled: true` — context 接近滿時自動 compact。
  - `autoCompactWindow: 600000` — 自動 compact 觸發視窗（token 數）；於 1M context 模型下約等於 60%。
- **`PROGRESS.md` 持續更新**：每完成一個任務 / 子任務即更新，確保任何時刻（自動 compact、換 session、撞用量上限）進度都已存檔。
- **SessionStart hook**：新 session 開始自動把 `PROGRESS.md` 內容注入 context，撞到 5-hour limit reset 後可無縫接續。
- 註：「5-hour limit 到 95% 自動停」無對應觸發事件，harness 無法偵測，本版不實作；但持續更新的 `PROGRESS.md` 已能讓 reset 後接續。

### 12.3 版本控管 / 遠端

- 遠端 repo：`https://github.com/wsturkey6-hash/BabyMonster.git`
- 本機已 `git init`；實作完成、且使用者明確同意後才推送（推送為對外動作，需逐次確認）。

## 13. 不做（YAGNI）

- 多寶寶、雲端帳號 / iCloud 同步
- PDF / 報表匯出
- 推播提醒、餵食排程
- 圖片附件（大便照片）
- 欄位級的匯入衝突合併

## 14. 未來可擴充

- 多寶寶（Record 加 babyId 外鍵）
- iCloud / CloudKit 自動同步
- PDF 醫療報告匯出
- last-modified 時間戳做匯入衝突解析
