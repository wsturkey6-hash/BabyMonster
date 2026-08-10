# 疫苗施打紀錄 — 設計文件（Spec）

- 日期：2026-08-10
- 狀態：設計已核可，待使用者審閱本文件
- 平台：Web（PWA）+ iOS，兩邊同時實作
- 相關文件：`2026-07-14-babymonster-design.md`（iOS MVP）、`2026-07-16-multi-baby-design.md`（多寶寶 v2）、`2026-07-18-babymonster-web-design.md`（網頁版）

## 1. 目標與動機

疫苗頁目前只是一份唯讀時程表：它知道「滿 2 個月要打哪些」，卻不知道「這個寶寶到底打了沒」。家長需要自己憑記憶或翻兒童健康手冊比對。

這次讓時程表能記錄每一劑的實際施打日期，並用背景顏色一眼區分**已經打了**和**還沒打**。同時補上目前完全沒有的「接種日已經過了卻沒打」提醒。

## 2. 範圍決策（已確認）

| 決策 | 選擇 |
|---|---|
| 平台 | 網頁版 + iOS 都做，資料格式一致 |
| 記錄粒度 | **每一劑**各自一個日期（五合一四劑分開記） |
| 匯出相容 | 進備份檔，以「只加選填欄位、不升版本號」的方式維持前後相容 |
| 儲存結構 | 獨立的接種紀錄表（不塞進寶寶資料，也不併進記錄流） |
| 逾期提醒 | 做，分公費／自費兩組呈現 |

### 2.1 為什麼不用其他兩種儲存法

- **塞進 `ProfileData`**：現行合併規則是「寶寶 id 對中就整包保留本機」，太太手機匯出的接種紀錄匯進來會被整包丟掉——而這正是最主要的使用情境。SwiftData 也不適合存 dictionary。
- **併進 `RecordData` 記錄流**：`RecordData` 已有 12 個欄位，統計頁、趨勢頁、當日備註全都要多一層排除邏輯，容易漏；而且「一劑打一次、之後可修改」的生命週期跟「當下發生的事件」本質不同。

## 3. 資料模型

### 3.1 值型別

一筆接種紀錄 = 寶寶 + 疫苗 + 劑次 + 日期。key 由前三者組成，因此同一寶寶的同一劑只會有一筆。

```
key       = "{babyId}|{vaccineId}|{doseLabel}"   例：a1b2…|dtap-hib-ipv|第一劑
babyId    寶寶 UUID（小寫正規化，與現有 records 相同）
vaccineId 疫苗 id，例 "dtap-hib-ipv"
doseLabel 劑次標籤，例 "第一劑" / "一劑"
date      實際施打日期，當地日期 00:00（與 ProfileData.birthDate 同一種存法）
```

用 `doseLabel` 而不是劑次索引當 key 的一部分：疾管署調整時程若在中間插入一劑，索引會整批位移，標籤不會。標籤在同一支疫苗內唯一。

- web：`web/src/logic/vaccineLog.ts` 定義 `VaccineDoseRecord` 與 `doseRecordKey()`
- iOS：`BabyMonster/Logic/VaccineLog.swift` 定義 `VaccineDoseData` 與同名 key 函式

key 只存在本機、不寫進備份檔（見 §4），所以真正的跨平台約束是 **`vaccineId` 與 `doseLabel` 兩邊逐字相同**——這已由兩份疫苗表同步維護保證。各平台內部組 key 時要一致處理 babyId 大小寫（web 一律小寫；iOS 用 `UUID` 的預設大寫字串），否則同一平台內會出現重複列。

### 3.2 儲存層

**web（Dexie）**：schema 版本 1 → 2，新增

```
vaccineDoses: 'key, babyId'
```

Dexie 在既有資料庫上新增資料表屬於自動遷移，`profiles` / `records` 不動。

**iOS（SwiftData）**：新增 entity

```swift
@Model final class VaccineDoseEntity {
    @Attribute(.unique) var key: String
    var babyId: UUID
    var vaccineId: String
    var doseLabel: String
    var date: Date
}
```

加進 `AppModelContainer.schema`。新增 entity 屬於 SwiftData 輕量遷移，與先前加入 `sleepRaw` / `urineAmountRaw` 的情況相同，舊資料庫可直接開啟。

**刪除寶寶時一併刪掉它的接種紀錄**：web 的 `deleteBabyCascade()` 多刪一張表，iOS 的刪除流程同步補上。

## 4. 匯出／匯入格式

版本號**維持 2**，只在最外層多一個選填陣列：

```json
{
  "version": 2,
  "profiles": [ … ],
  "records": [ … ],
  "vaccineDoses": [
    { "babyId": "a1b2…", "vaccineId": "dtap-hib-ipv",
      "doseLabel": "第一劑", "date": "2026-03-14T16:00:00Z" }
  ]
}
```

- `key` 不寫進檔案（可從其他三個欄位推出），匯入時重新組出來。
- 日期沿用既有的 ISO 8601 無毫秒格式（Swift `JSONDecoder(.iso8601)` 不接受毫秒）。當地日期 00:00 轉成 UTC 後在台灣是前一天 16:00，兩平台都以當地時區格式化回來，顯示一致。

### 4.1 相容性

| 情境 | 行為 |
|---|---|
| 舊版 App 讀新檔 | web `decodeAny` 檢查 `version === 2 && Array.isArray(profiles) && Array.isArray(records)` → 通過，忽略 `vaccineDoses`；iOS `JSONDecoder` 忽略未知鍵。**不會整檔拒絕**。 |
| 新版 App 讀舊檔 | `vaccineDoses` 不存在 → 視為空陣列 |

刻意不升到 version 3，就是為了避免舊版 PWA（可能還在太太手機的快取裡）看到不認得的版本號而拒絕整份備份。

### 4.2 合併規則

沿用現有記錄的規則：

1. 寶寶以名字對中時，incoming 的 `babyId` 跟著重對映（與 `mergeBabies` 用同一份 remap）
2. 以 key 去重，**本機優先**
3. 輸出依 `babyId` → `vaccineId` → `doseLabel` 排序，確保可重現

與現有記錄一樣，「刪除」無法透過合併傳播（本機沒有的 key 會從 incoming 補回來）。這是既有設計取捨，不在本次範圍。

## 5. 邏輯層

新模組（web `vaccineLog.ts` / iOS `VaccineLog.swift`）只放純函式，不碰儲存：

| 函式 | 用途 |
|---|---|
| `doseRecordKey(babyId, vaccineId, doseLabel)` | 組 key |
| `doneMap(records)` | key → 施打日期的查表 |
| `overdueDoses(birthDate, now, done, vaccines?)` | 接種日已過且沒紀錄的劑次，依月齡排序 |

`vaccines.ts` / `Vaccines.swift` 的 `nextMilestone` / `next` 加一個選填的「已完成 key 集合」參數：整組劑次都有紀錄的月齡直接跳過，預設空集合時行為與現在相同。

### 5.1 日期邊界（一併修正的既有問題）

現行 `nextMilestone` 用 `接種日 > 現在`，所以「今天該打的那一劑」過了午夜就從「接下來要打的疫苗」消失，卻又還沒被歸為逾期。加上逾期清單後這個縫會被看見，因此統一以「今天 00:00」切：

- **即將接種**：`接種日 >= 今天 00:00`（今天到期顯示「還有 0 天」）
- **逾期未打**：`接種日 < 今天 00:00` 且沒有施打紀錄

這會改變現有行為，相關測試一併更新。兩平台同步修改。

出生當天的疫苗（B 肝第一劑、HBIG，月齡 0）在出生當天屬於「即將接種」而非逾期。

## 6. 畫面與互動

### 6.1 時程表：兩種狀態

| 狀態 | 呈現 |
|---|---|
| 還沒打 | 維持現狀（公費白底、自費粉底，邊框區分） |
| 已施打 | 綠底綠框 + ✓，副標從「第一劑・公費」改成「第一劑・2026/03/15」 |

時程表**不加逾期紅色**：1 歲以上的寶寶會有大片自費疫苗過期（多半是刻意不打），全部標紅會淹沒重點。逾期集中在 6.3 呈現。

web 新增 `.vaccine-chip.done` 樣式，沿用現有 clay 卡片語彙（`--shadow-clay-sm`、`--radius-md`）。它與 `.vaccine-chip.self` 特異性相同，必須寫在其後才蓋得掉自費的粉底，hover 狀態也要一併覆寫。iOS 用對應的綠色背景與 `checkmark.circle.fill`。

顏色不是唯一線索：已施打同時有 ✓ 圖示與日期文字，色覺辨識有困難時仍讀得出來。

### 6.2 對話框：輸入施打日期

沿用現有的 `InfoDialog`（web）／`VaccineDetailSheet`（iOS）。說明文字不動，「接種時程」清單每一列多一個日期欄位：

```
滿 2 個月    第一劑・公費     [ 2026/03/15 ]   清除
滿 4 個月    第二劑・公費     [ 尚未施打   ]
滿 6 個月    第三劑・公費     [ 尚未施打   ]
滿 18 個月   第四劑・公費     [ 尚未施打   ]
```

- 點任何一個劑次的標籤，開的都是同一支疫苗的框，**四劑都能在裡面補**——回頭補登歷史時不必一劑一劑找。
- **選好即存**，沒有儲存按鈕；「清除」把該劑改回未施打。
- 尚未建立寶寶時欄位停用，顯示提示引導到設定頁。

補登過去的紀錄時，實際日期通常就落在預計接種日附近，所以兩個平台都提供「一鍵帶入預計接種日」，但實作方式不同：

- **web**：`<input type="date">`，未施打時值為空（不能預填，否則看起來像已經有紀錄）。旁邊放一顆「預計 2026/05/15」按鈕，按下即以該日期存檔，再自行微調。輸入框需搭配 `<label for>` 與唯一 `id` 供輔助技術辨識。
- **iOS**：`DatePicker` 永遠有值，無法表達「沒有日期」，所以未施打時只顯示「記錄施打」按鈕；按下即以預計接種日建立紀錄並展開 `DatePicker` 供微調。

### 6.3 逾期未打

放在「接下來要打的疫苗」卡片頂端，分兩組：

- **公費**：強調色，`五合一 第二劑・預計 2026/05/15・逾期 30 天`
- **自費**：灰色次要樣式，附註「依醫師建議選擇性接種」

分組的理由：六合一與五合一擇一、輪狀／腸病毒／流腦等自費項目本來就常整支跳過，混在同一份清單裡會變成永久雜訊，反而破壞「哪些還沒打」這個目的。

每一項可點，開的是 6.2 的對話框。全部劑次都有紀錄時整塊不顯示。

「接下來要打的疫苗」本身會跳過整組都完成的月齡；顯示的那組裡已完成的劑次照樣顯示綠色。

## 7. 錯誤處理

| 情境 | 行為 |
|---|---|
| 沒有寶寶 | 日期欄位停用，提示到設定頁新增；逾期區塊不顯示 |
| 匯入檔的 `vaccineDoses` 欄位型別錯誤 | 沿用現有「整檔拒絕」策略，附上第幾筆的錯誤訊息 |
| 匯入檔含未知 `vaccineId` / `doseLabel`（疫苗表更新後） | 資料照樣保留，時程表上比對不到就不顯示。避免因為疾管署調整時程而靜默刪掉家長輸入的紀錄 |
| 日期為未來 | 允許（可能先預約），不擋 |
| 同 key 重複寫入 | upsert 覆蓋 |

## 8. 測試

新增 `web/tests/vaccineLog.test.ts` 與 `BabyMonsterTests/VaccineLogTests.swift`，鏡射同一批案例：

- key 組法（兩平台字串必須逐字相同）
- `doneMap` 查表
- 逾期邊界：出生當天、今天到期、昨天到期、已填日期不算逾期
- `nextMilestone` 跳過整組完成的月齡；部分完成不跳過
- 合併：本機優先、名字對中時 babyId 重對映、id 大小寫正規化
- 匯出匯入往返；舊檔缺欄位；新檔被舊解析器忽略（沿用既有的 fixture 相容測試手法）

同時更新現有疫苗測試的日期邊界（`>` → `>= 今天`）。

驗證：web `npm test` + `npm run build` + 瀏覽器實際操作一輪；iOS `xcodebuild test` + 模擬器操作一輪（含舊 schema 資料庫覆蓋安裝，確認輕量遷移通過）。

## 9. 非目標（YAGNI）

- **「這劑決定不打」的第三種狀態**：逾期清單分公費／自費已能解決雜訊問題，不引入新狀態
- 流感每年重複提醒
- 疫苗廠牌、批號、接種院所、副作用記錄
- 接種提醒推播

## 10. 已知落差（沿用既有，非本次新增）

- 五合一與六合一並列不互斥
- 疫苗時程寫死在程式碼，疾管署更新時 `BabyMonster/Logic/Vaccines.swift` 與 `web/src/logic/vaccines.ts` 兩處都要手動同步
- 合併無法傳播刪除
