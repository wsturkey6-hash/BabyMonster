# 身高／頭圍記錄與生長曲線 — 設計

日期：2026-08-19
狀態：已核可，待實作
範圍：web（PWA）+ iOS，兩平台同步

## 1. 目標

1. 記錄頁增加**身高**與**頭圍**欄位，趨勢圖增加對應的兩個指標。
2. 新增**生長曲線**功能：依最新的身高／體重／頭圍，分別顯示落在 WHO 生長曲線的第幾百分位，並畫出參考曲線與寶寶的歷次測量點。

## 2. 已確認的決策

| 議題 | 決定 |
|---|---|
| 性別 | 加進寶寶資料，**選填**（`male` / `female`）。沒設定時生長曲線頁顯示引導，其他頁面不受影響 |
| 生長曲線呈現 | 曲線圖 + 百分位數字，比照兒童健康手冊 |
| 年齡範圍 | WHO 2006 標準，0–5 歲（day 0–1856） |
| 分頁位置 | **併進趨勢頁**，上方加「日常趨勢／生長曲線」切換。iPhone TabView 超過 5 個會被收進 More，不新增第 6 個分頁 |
| 稀疏資料 | 體重／身高／頭圍三個「狀態量」在趨勢圖**連接有值的點**；次數與累計量維持斷開 |
| 百分位算法 | 內建 LMS 參數即時計算（見 §4） |
| 兩平台資料同步 | 單一 canonical JSON + 產生器腳本產出 TS 與 Swift，兩者都 commit |

## 3. 資料模型

### 3.1 記錄新增欄位

| 欄位 | 型別 | 單位 |
|---|---|---|
| `height` | 選填數字 | cm |
| `headCircumference` | 選填數字 | cm |

命名用 `height` 而非 `length`。WHO 技術上 2 歲前量的是「躺著的身長」、2 歲後是「站著的身高」，但對使用者統一叫身高較直覺，差異在 UI 用一行小字說明。

### 3.2 寶寶資料新增欄位

`sex`：選填，`male` / `female`。

### 3.3 儲存層

- **iOS SwiftData**：`RecordEntity` 加 `height`、`headCircumference`；`ProfileEntity` 加 `sexRaw`。三者皆 optional → 輕量遷移自動加欄位。**須依既有慣例用改動前的 build 建舊 schema 資料庫、覆蓋安裝驗證。**
- **web Dexie**：三個欄位都不是索引，Dexie 的 `stores()` 只宣告索引 → **不需要 version bump**，維持 v2。

### 3.4 備份檔相容性

沿用疫苗紀錄那次的策略：**`version` 維持 2**，只加三個選填欄位。值為空時整個鍵不輸出（Swift 自動合成的 Codable 對 Optional 用 `encodeIfPresent`，與現有 `feedAmount` 行為一致）。

- 舊版 App 讀新檔 → 忽略這三個欄位，不會整檔拒絕
- 新版讀舊檔 → 缺欄位當空值
- 沒用到新功能的使用者匯出的檔案 → 與現在**逐字節相同**

已知取捨：舊版 App 讀新檔時會默默忽略身高／頭圍，不會提示使用者資料沒帶到。判斷是「整檔可讀」比「完整或明確失敗」重要，與疫苗那次一致。

## 4. 生長曲線計算

### 4.1 LMS 公式

WHO 每個年齡給三個參數 L（偏態）、M（中位數）、S（變異係數）：

```
測量值 → Z：  L≠0:  Z = ((X/M)^L − 1) / (L·S)
              L=0:  Z = ln(X/M) / S
Z → 測量值：  L≠0:  X = M · (1 + L·S·Z)^(1/L)
              L=0:  X = M · exp(S·Z)
百分位 = Φ(Z) × 100
```

反向式用來畫 P3／P15／P50／P85／P97 五條參考曲線 —— 圖和數字出自同一份參數，不可能對不起來。

### 4.2 資料來源與格式

WHO Child Growth Standards（2006）expanded z-score tables，**每個年齡日一列**（day 0–1856），三個指標 × 男女 = 6 張表：

- weight-for-age（`wfa-{boys,girls}-zscore-expanded-tables.xlsx`）
- length/height-for-age（`lhfa-{boys,girls}-zscore-expanded-tables.xlsx`）
- head-circumference-for-age（`hcfa-{boys,girls}-zscore-expanded-tables.xlsx`）

於 2026-08-19 自 `cdn.who.int` 取得，完整網址記在 `data/who-growth-reference.json` 的 `sourceUrls`。

**採用逐日資料而非按月內插。** 實測按月內插的最壞誤差達 **9.3 個百分點**（P50 會被顯示成 P41），主因有二：

1. 新生兒頭幾天體重的 LMS 變化極快
2. **day 730→731 身高中位數陡降 0.67 cm** —— WHO 在滿 2 歲切換躺姿／站姿量法，跨這個接縫做線性內插沒有意義

而逐日全表用「定點數 + 差分」編碼後只有 **86 KB 原始／8.1 KB gzip**，比任何取樣方案的樸素編碼都小。因此不取樣，保留 WHO 每一天的精確值，內插誤差為零。

### 4.3 編碼

- 定點數：L、M ×10000，S ×100000（經驗證可完全還原原始精度）
- 差分編碼：相鄰日差值很小 → gzip 後 8.1 KB
- 以整數陣列字面值產生，載入時做一次前綴和還原

（實測 Swift 對 33,000 個整數字面值的型別檢查在 1 秒內完成，不需改用字串literal 繞路。）

### 4.4 年齡以「天」為單位

參考表以天為索引，因此百分位計算一律用**足歲天數**（測量當日 00:00 − 生日 00:00），不換算成小數月齡。這既精確又完全對齊資料來源。月齡只在 X 軸標示時做顯示換算。

### 4.5 常態分布 CDF

兩平台都用同一個 Abramowitz & Stegun 近似式。Swift 的 Foundation 雖有內建 `erf`，但用它會讓兩平台出現微小差異；寧可各寫一份相同近似式，再用測試釘住兩邊輸出一致。

### 4.6 邊界情況

| 情況 | 行為 |
|---|---|
| 未設定性別 | 顯示引導與前往設定的按鈕 |
| 年齡 > 1856 天（滿 5 歲） | 顯示「WHO 生長標準到 5 歲為止」 |
| 年齡 < 0（測量早於生日） | 該筆不納入計算 |
| 該指標從未記錄 | 顯示「還沒有身高記錄」之類的提示 |
| \|Z\| > 3 | 百分位顯示為「< 0.1」／「> 99.9」，不報假精確的數字 |

## 5. 檔案配置

```
data/who-growth-reference.json          canonical LMS（唯一來源，勿手改）
data/who-growth-verification.json       630 筆取自 WHO 自家 SD 欄位的期望值
scripts/generate-growth-reference.mjs   產生器：JSON → TS + Swift

web/src/logic/growthReference.generated.ts
web/src/logic/growthPercentile.ts       Z 分數、百分位、反推參考值
web/src/logic/growthChart.ts            組裝頁面資料
BabyMonster/Logic/GrowthReference.generated.swift
BabyMonster/Logic/GrowthPercentile.swift
BabyMonster/Logic/GrowthChart.swift
```

兩個 generated 檔都 commit 進 repo：iOS 不必改手寫的 pbxproj、web 不必改建置流程。CI 重跑產生器後 `git diff` 必須是空的 —— 任一邊被手改就會紅。

## 6. UI

### 6.1 記錄頁

在「體重（g）」後面加兩欄：身高（cm，例 60.5）、頭圍（cm，例 40.2）。時間軸 chip 加 `📏 60.5 cm`、`🧢 40.2 cm`。

### 6.2 趨勢頁

- 上方加「日常趨勢／生長曲線」切換
- 日常趨勢：指標下拉新增「平均身高（cm）」「平均頭圍（cm）」；體重／身高／頭圍改為連接有值的點
- 生長曲線：
  - 三個指標的百分位摘要**全部列出**，各自標註自己的測量日期（身高體重常不是同一天量的，不標會誤導）
  - 圖只畫當前選取的指標：五條灰色參考曲線 + 寶寶歷次測量點連線
  - X 軸上限取級距 `[3, 6, 12, 24, 36, 60]` 中第一個 ≥ 寶寶目前月齡者，避免資料全擠在左邊

### 6.3 設定頁

編輯寶寶加性別選擇（男／女／未設定）。

## 7. 測試

web（vitest）與 iOS（XCTest）鏡射：

- **資料正確性**：`data/who-growth-verification.json` 的 630 筆案例，實作算出的值須與 WHO 自家 SD 欄位相符（容差 0.0005，即 WHO 的 3 位小數捨入極限）。抄錯或編碼壞掉都會紅。
- **產生器一致性**：重跑產生器後 generated 檔與 repo 內容相同。
- **LMS 邏輯**：Z ↔ 值雙向、L=0 分支、超出範圍、極端 Z 值截斷。
- **常態 CDF**：對照已知值（Φ(0)=0.5、Φ(1.96)=0.975 等）。
- **跨平台一致性**：一組固定測試向量（性別 × 天數 × 測量值），兩平台對照**同一份期望值 JSON**，任一邊走鐘就會紅。
- **既有邏輯擴充**：dailyStats 新增平均身高／頭圍；trendSeries 新增兩個指標與連線行為。
- **備份格式**：新欄位往返、舊檔缺欄位、新檔給舊版；延續既有做法用真 Swift 程式碼產生含新欄位的 fixture 給 web 驗證。

## 8. 這次刻意不做

- BMI-for-age、weight-for-length（WHO 另有標準表，但家長日常較少看）
- 早產兒矯正年齡（需要另存懷孕週數，且矯正規則有多種慣例）
- 生長速度（velocity）曲線
- 5 歲以上（WHO 標準到此為止；5–18 歲要換另一套 growth reference）
