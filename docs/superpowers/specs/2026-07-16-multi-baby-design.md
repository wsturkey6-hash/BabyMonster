# BabyMonster — 多寶寶功能設計文件（Spec）

- 日期：2026-07-16
- 狀態：使用者已核可設計，待審閱本文件
- 基礎：`main`（MVP 完成、27 測試通過）；原始 spec 見 `2026-07-14-babymonster-design.md`

## 1. 目標

讓 App 支援記錄多個寶寶（不限兩個），全 App 維持一個「當前寶寶」視角切換。既有單寶寶資料與舊版匯出檔必須無痛升級。

## 2. 已確認決策

- **多寶 + 全 App 單一當前寶寶**：切換器影響記錄/統計/趨勢三頁。
- **不做兩寶對比**：一次看一個寶寶。
- **匯出可選範圍**：「全部寶寶」（預設）或個別寶寶。
- **v1 舊匯出檔照常匯入**：自動歸屬（見 §7）。
- **刪寶寶連動刪除其全部記錄**（需確認框）。
- **限制**：舊版 App 無法讀 v2 匯出檔 → 兩支手機需一起更新。

## 3. 資料模型變更

```
ProfileEntity（SwiftData）
  + id: UUID = UUID()          // 新欄位，有預設值 → 輕量遷移自動處理
                               // 不加 @Attribute(.unique)，唯一性由程式保證

RecordEntity（SwiftData）
  + babyId: UUID?              // 新欄位 optional → 輕量遷移自動處理
                               // nil = 尚未歸屬（僅存在於遷移前的舊資料）

ProfileData（Codable 值型別）
  + id: UUID

RecordData（Codable 值型別）
  + babyId: UUID?
```

- 純邏輯層 `DailyStats` / `TrendSeries` / `BabyAgeCalculator` **介面與實作皆不變**：它們接收 `[RecordData]`，由呼叫端先按 `babyId == 當前寶寶` 過濾。
- `RecordEntity.data` / `init(data:)` / `apply(_:)` 對映新增 babyId 欄位；`ProfileEntity` 同理新增 id。

## 4. 啟動遷移（一次性歸屬）

App 啟動（root view 出現）時執行 `LegacyMigration.run(context:)`：

1. 撈出 `babyId == nil` 的記錄。若無 → 結束（冪等，之後每次啟動都是 no-op）。
2. 若無任何 `ProfileEntity` → 建立預設寶寶 `ProfileEntity(name: "BabyMonster", birthDate: 今天)`。
3. 將所有 nil-babyId 記錄的 `babyId` 設為第一個寶寶的 `id`。

以 in-memory ModelContainer 單元測試：nil 歸屬、自動建預設寶寶、冪等（跑兩次結果相同）。

## 5. 當前寶寶與切換

- `@AppStorage("currentBabyId")` 儲存 UUID 字串。
- 解析規則：存的 id 在現有寶寶中找不到（被刪、首次啟動）→ 退回第一個寶寶；完全沒有寶寶 → nil（見下）。
- **記錄/統計/趨勢**三頁導覽列放切換器：顯示「寶寶名 ▾」的 Menu，列出所有寶寶供切換。
- 三頁資料一律過濾 `babyId == 當前寶寶.id`。
- 新記錄儲存時綁定當前寶寶的 id。
- **無寶寶狀態**：儲存記錄時若無任何寶寶 → 自動建立預設寶寶「BabyMonster」（生日=今天）並綁定，記錄流程不中斷；使用者可之後到設定頁改名。無寶寶時切換器隱藏，統計/趨勢頁顯示空資料（現行空狀態行為）。
- 記錄頁頂部的名字＋年齡列顯示當前寶寶。

## 6. 寶寶管理（設定頁改版）

- 「寶寶」區塊改為**寶寶清單**：每列顯示名字＋目前年齡，點入編輯（名字、生日，沿用現有欄位與年齡顯示）。
- 「新增寶寶」按鈕 → 輸入名字＋生日。
- 清單滑動刪除 → 確認框：「將一併刪除『{名字}』的 {N} 筆記錄，確定刪除？」→ 確認後刪除該寶寶與其全部記錄（手動 cascade）。
- 刪到一個不剩是允許的；下次記錄時依 §5 自動重建預設寶寶。
- 現行「儲存寶寶資料」單一表單流程由清單＋編輯頁取代。

## 7. 匯出 / 匯入 v2

### 7.1 v2 格式

```json
{
  "version": 2,
  "profiles": [ { "id": "...", "name": "...", "birthDate": "..." } ],
  "records":  [ { "id": "...", "babyId": "...", ... } ]
}
```

### 7.2 匯出

- 設定頁匯出時選範圍：**全部寶寶（預設）** 或個別寶寶。
- 單寶匯出：profiles 只含該寶寶、records 只含其記錄。
- 檔名：全部 `BabyMonster-yyyyMMdd.json`；單寶 `BabyMonster-{名字}-yyyyMMdd.json`。
- 仍走現有分享 sheet（LINE 等）。

### 7.3 匯入合併（核心規則）

對每個進來的寶寶（profile）：
1. 以 `id` 比對本機寶寶 → 相同即同一寶寶（保留本機名字/生日）。
2. id 沒中 → 以**名字完全相同**比對 → 視為同一寶寶，並把進來記錄的 `babyId` **重對映**到本機該寶寶的 id。
3. 都沒中 → 以進來的 id/名字/生日新建寶寶。

記錄合併沿用現行規則：以 record `id` 聯集去重、重複 id 保留本機、依 timestamp 排序。（重對映發生在去重之前。）

> 名字比對解決「兩支手機各自升級 → 同一小孩兩個不同 UUID」的重複問題。

### 7.4 v1 舊檔相容

- 解碼順序：先試 v2（有 `version: 2` 與 `profiles` 鍵）→ 失敗改試 v1 `{profile, records}`。
- v1 檔轉換：其 profile 依 §7.3 規則（無 id → 直接進名字比對）對應或新建寶寶；其 records（無 babyId）全部綁定該寶寶後，走一般合併。
- 純函式化：`DataTransfer.decodeAny(_:) -> BackupPayloadV2`、`mergeBabies(local:incoming:)`（含重對映），全部單元測試。

## 8. 測試策略

TDD 覆蓋（純邏輯）：
- v2 round-trip 編解碼
- v1 檔解碼 → 轉 v2（寶寶歸屬正確）
- 匯入合併：id 對中、名字對中（含 babyId 重對映）、全新寶寶、記錄去重本機優先
- 啟動遷移（in-memory container）：歸屬、自動建寶、冪等
- 過濾與 UI 綁定屬視圖層：建置 + 模擬器啟動驗證

## 9. 不做（YAGNI）

- 兩寶對比圖表、寶寶頭像/照片、每寶寶主題色
- 記錄轉移到另一個寶寶（記錯就刪掉重記）
- iCloud/CloudKit 同步
- v2 檔案的向下相容匯出（不提供「另存 v1 格式」）

## 10. 風險與緩解

| 風險 | 緩解 |
|---|---|
| SwiftData 加欄位遷移失敗 | 僅加「optional / 有預設值」欄位（官方輕量遷移支援範圍）；升級前既有 27 測試 + 遷移測試把關 |
| 兩機各自升級造成寶寶重複 | §7.3 名字比對 + babyId 重對映 |
| 舊版 App 收到 v2 檔 | 明確限制：兩機一起更新；匯入失敗時 v1 App 會顯示錯誤而非壞資料 |
| 刪寶寶誤刪記錄 | 確認框載明將刪除的記錄筆數 |
