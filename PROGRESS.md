# BabyMonster 專案進度

> 每完成一個任務就更新此檔。SessionStart 會自動載入本檔，撞到用量上限 reset 後可據此接續。

## 目前狀態（2026-08-19 更新）
- 階段：**身高／頭圍記錄 + 生長曲線完成**（feature/growth-metrics，web + iOS 同步）
- Spec：`docs/superpowers/specs/2026-08-19-growth-metrics-design.md`
- 功能：
  1. 記錄頁新增身高、頭圍欄位；趨勢頁指標多了平均身高／平均頭圍
  2. 趨勢頁改成「日常趨勢／生長曲線」兩種模式（**不新增第 6 個分頁** —— iPhone TabView 超過 5 個會被收進 More）
  3. 生長曲線畫 P3/P15/P50/P85/P97 五條參考線 + 寶寶歷次測量點，三個指標的百分位各自標註測量日期（身高體重常不是同一天量的）
- 寶寶資料新增 `sex`（選填，male/female）—— 生長曲線男女參考值完全不同，沒設定時該頁顯示引導，其他頁面不受影響
- 測試數：web **132 → 196**、iOS **97 → 162**，全數通過

### WHO 參考資料（重要）
- 來源：WHO Child Growth Standards (2006) expanded z-score tables，2026-08-19 自 cdn.who.int 取得
  - ⚠️ 身長那組路徑是 `expandable-tables`，體重／頭圍是 `expanded-tables`，網址不一致
- **採逐日資料（day 0–1856）而非按月內插**。實測按月內插最壞誤差 **9.3 個百分點**（P50 會顯示成 P41），兩個主因：
  1. 新生兒頭幾天體重的 LMS 變化極快
  2. **day 730→731 身高中位數陡降 0.67cm** —— WHO 在滿 2 歲切換躺姿／站姿量法，跨接縫內插沒有意義
- 逐日全表經「定點數 + 差分」編碼後只有 88 KB 原始／9.3 KB gzip，比任何取樣方案的樸素編碼都小，所以不取樣、內插誤差為零
- **兩平台不再各寫一份**（解決疫苗表的老問題）：`data/who-growth-reference.json` 是唯一來源，
  `scripts/generate-growth-reference.mjs` 產出 web 的 `.ts` 與 iOS 的 `.swift`，兩者都 commit。
  CI 跑 `--check`，任一邊被手改就會紅
- 資料正確性有兩道防線：
  - `data/who-growth-verification.json`（630 筆）直接取自 WHO 自家發布的 SD 欄位，兩平台都要對得上（容差 0.0005，即 WHO 的 3 位小數捨入極限）
  - `data/growth-percentile-vectors.json`（660 筆）由 Python 高精度算出，釘住兩平台的 z 與百分位一致

### 實作決定
- 年齡一律用**足歲天數**（不換算成小數月齡）—— WHO 表就是以天為索引，這樣最貼近資料來源
- 常態分布：iOS 用 Foundation 內建 `erfc`，web 用不完全 Gamma 函數展開自己實作同等精度的 erfc。
  兩者都準到 1e-15 等級因此必然吻合 —— 比兩平台共用同一個低精度近似式（A&S 誤差 7.5e-8）可靠
- 趨勢圖：體重／身高／頭圍是「狀態量」，缺值時**連接**前後點；次數與累計量維持斷開（沒記錄 ≠ 那天是 0）
  - 順帶修掉既有落差：iOS 原本略過 nil 點，Swift Charts 會自動連過去，等於所有指標都連線；現已依 `connectsGaps` 分段
- 備份檔 **version 維持 2**，只加三個選填欄位（`profile.sex`、`record.height`、`record.headCircumference`），
  沿用疫苗那次的策略：舊版讀新檔會忽略而非整檔拒絕；沒用到新功能的匯出結果與舊版逐字節相同
  - 已知取捨：舊版讀新檔會默默忽略身高頭圍，不會提示使用者資料沒帶到
- web bundle：88 KB 的參考表只進 lazy-load 的 TrendPage chunk（gzip 14.6 KB），主 bundle 不受影響（已用指紋比對確認）

### 驗證
- **SwiftData 輕量遷移實測通過**：用改動前的 build（1d63c92）建舊 schema 資料庫（1 寶寶 9 記錄含備註／睡眠／大便色），
  覆蓋安裝新版後 `ZHEIGHT`／`ZHEADCIRCUMFERENCE`／`ZSEXRAW` 自動加上，逐欄位比對舊資料完全一致，新欄位為 NULL，無 crash
- web 在瀏覽器實測：生長曲線圖、三指標百分位、未設性別的引導、設定頁性別選取與**取消選取**（Dexie 會把 key 整個移除，不是留 undefined，這對匯出正確性有影響）
- iOS 在模擬器截圖確認曲線圖與百分位摘要（因無法注入點擊，用 scratchpad 內的臨時 worktree 建了只開趨勢頁的版本截圖，未汙染 repo）

### 2026-08-19 後續：iOS 選單 Picker 全壞（已修）
使用者執行 `sudo xcode-select -s ...` 後，iOS Simulator MCP 終於可用、能注入點擊，
第一次真的用手點過 iOS App，立刻抓到一個**既有且嚴重**的問題：

- `dismissKeyboardOnTap()` 用 `simultaneousGesture(TapGesture())` 做「點空白處收鍵盤」，
  這個手勢會把 SwiftUI **選單的呈現一起吃掉** → Form 裡所有 `.menu` 樣式的 Picker 點了沒反應
- 受影響：**大便量、大便形狀、睡眠（既有，早就壞了）** + 這次新加的**性別**
- 性別選不了 → 生長曲線永遠算不出百分位 → 新功能在 iOS 上等於不可用
- 同一個 Form 裡的 `DatePicker` 正常（用 popover 而非選單），這是定位問題的關鍵線索
- 修法：改成 `scrollDismissesKeyboard(.interactively)` + 鍵盤上方「完成」按鈕，
  函式改名 `keyboardDismissable()`。收鍵盤仍有兩種方式，且不攔截任何控制項
- 修正後實測：性別可選 → 新增 3400g / 50.0cm / 34.5cm → 生長曲線顯示第 54 / 52 / 51 百分位
  （WHO 男寶 day 0 中位數 3.3464kg / 49.8842cm / 34.4618cm，數值相符，day 0 邊界一併驗證）

**教訓：純靠單元測試 + 截圖驗不出「控制項點不動」這類問題。** 只要能注入點擊就該真的點過一遍。

### 環境限制
- iOS Simulator MCP **已可用**（2026-08-19 使用者執行 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` 後）
  - 可注入點擊、輸入文字（**僅 ASCII**，中文輸入不了 → 測試資料用英文名）
- osascript 的輔助取用（Accessibility）仍未開啟，但有了 Simulator MCP 就不需要它了

### 這次刻意不做
- BMI-for-age、weight-for-length（WHO 另有標準表，家長日常較少看）
- 早產兒矯正年齡（需另存懷孕週數，且矯正規則有多種慣例）
- 生長速度（velocity）曲線
- 5 歲以上（WHO 標準到此為止；5–18 歲要換另一套 reference）

## 前一階段狀態（2026-08-10 更新）
- 階段：**疫苗施打紀錄完成**（feature/vaccine-dose-log，11/11 tasks，web + iOS 同步）
- Spec：`docs/superpowers/specs/2026-08-10-vaccine-dose-log-design.md`；Plan：`docs/superpowers/plans/2026-08-10-vaccine-dose-log.md`
- 功能：點疫苗可逐劑填施打日期 → 時程表該劑轉綠底 + ✓ + 日期；接種日已過又沒紀錄的列在「接下來要打的疫苗」上方，分公費／自費兩組（自費多半是刻意跳過，混在一起會變雜訊）
- 測試數：web **109 → 132**、iOS **78 → 97**，全數通過
- 新資料表（獨立，不動既有記錄流）：Dexie `vaccineDoses`（schema v1→v2）／SwiftData `VaccineDoseEntity`
  - 主鍵 `babyId|vaccineId|劑次`；web 一律小寫 babyId、iOS 用 `UUID.uuidString`（大寫）。key **只存本機、不寫進備份檔**
- 備份檔相容策略：**`version` 維持 2**，只加選填的 `vaccineDoses`；空陣列時整個鍵不輸出
  - 舊版 App 讀新檔會忽略這段而非整檔拒絕；新版讀舊檔缺欄位當空陣列
- 三個一併修掉的既有問題：
  1. `nextMilestone`／`Vaccines.next` 原本用「> 現在」，今天到期的那劑過午夜就從畫面消失又還沒算逾期。改成以「今天 00:00」切，今天到期顯示「還有 0 天」
  2. **`BabyMonsterApp` 自己寫死一份 model 清單**，沒用 `AppModelContainer.schema`，導致新 entity 只進測試容器、正式 App 不建表（模擬器實測才抓到）。兩邊已統一
  3. 施打日期原本在**解碼時**做 `startOfDay`，值會隨讀取端時區位移（台北寫、UTC 讀差一天）。正規化改成只發生在使用者輸入時；web 測試在 Asia/Taipei／UTC／America/New_York 三時區都通過
- 跨平台驗證（兩個方向都做）：
  - iOS → web：用 repo 內真 Swift 程式碼編譯產生 `web/tests/fixtures/ios-v2-export-vaccines.json`，`iosExportFixtures.test.ts` 驗證解析與往返（任一邊 wire format 走鐘就會紅）
  - web → iOS：web 產出的 JSON 用真 iOS 程式碼解碼，日期與劑次正確，再編碼回去除 UUID 大小寫外完全一致
  - SwiftData 輕量遷移：用 `4647faf` 的 build 建舊 schema 資料庫並塞 1 寶寶 1 記錄，覆蓋安裝新版後 `ZVACCINEDOSEENTITY` 自動建表、舊資料與備註全保留、無 crash
- 模擬器仍走 `xcrun simctl`（iOS Simulator MCP 被 xcode-select 檢查擋住，需 `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`；osascript 輔助取用也沒開，無法注入點擊）
- 這次刻意不做：「這劑決定不打」的第三種狀態（六合一/五合一擇一）、流感每年提醒、疫苗廠牌／批號／副作用
  - 逾期清單分公費／自費已能壓住雜訊；若之後自費清單還是太吵，再考慮加「不打」狀態

## 前一階段狀態（2026-08-09 更新）
- 階段：**iOS 已追平網頁版功能**（feature/ios-parity，9/9 tasks）
- Plan：`docs/superpowers/plans/2026-08-09-ios-feature-parity.md`
- 補上的五項：小便量（`urineAmount`）、睡眠追蹤（`sleep` 事件 + 當日總時數）、當日備註、記錄頁可切換到往前任一天、疫苗分頁
- iOS 測試數 **47 → 78**，全數通過
- 兩個刻意的平台差異（不是缺漏）：
  1. 記錄清單用自己的日期選擇器（iOS 表單是 modal sheet，無法像網頁版跟著表單時間走）
  2. 月底出生的接種日，iOS 用 `Calendar` 夾到月底（1/31 + 1 月 → 2/28），網頁版 JS 會溢位成 3/3；iOS 行為較合理，刻意不對齊
- 疫苗資料版本：公費 **疾管署 11401 版（114 年 1 月）**、自費 **SIMBA 2026.03 版**
  - ⚠️ 疾管署更新時，`BabyMonster/Logic/Vaccines.swift` 與 `web/src/logic/vaccines.ts` **兩處都要改**（本次已逐劑比對，兩邊 15 支疫苗的 id／劑次／月齡／公費自費完全一致）
- 模擬器實機驗證（因 iOS Simulator MCP 被 xcode-select 檢查擋住，改用 `xcrun simctl` + sqlite3 塞舊 schema 資料）：
  - **SwiftData 輕量遷移通過**：用改動前的 build 建出舊 schema 資料庫、塞 1 寶寶 3 記錄，覆蓋安裝新版後 `ZSLEEPRAW`／`ZURINEAMOUNTRAW` 自動加上，舊資料與備註全部保留、無 crash
  - 統計頁睡眠 7 小時 30 分（跨夜午夜切分 6 小時 + 午睡 1.5 小時）正確
  - 疫苗頁：生日 2025-09-01 → 「滿 1 歲 / Sep 1, 2026（還有 23 天）」、公費三項、兩週間隔提醒皆正確
- 仍存在的已知落差（網頁版也沒有，非本次缺漏）：五合一/六合一並列不互斥、流感不逐年提醒、疫苗沒有「已完成」勾選（**已於 2026-08-10 補上**）、疫苗資料寫死需手動同步兩平台

## 前前一階段狀態（2026-07-20 更新）
- 階段：**三大里程碑 + 延後項目 + UI 可愛改版全部完成**
- 2026-07-20 完成：
  - 延後項目 7/7（4fdea17）：iOS 實匯出檔 fixture 測試（用真 Swift 程式碼編譯產生 fixture、雙向相容驗證、修 v1 profile id 保留）、totalFeed 小數格式（formatNumber）、刪寶寶後匯出範圍重設、share 失敗退回下載、toast 計時器、PR 觸發 CI（web-ci.yml）、recharts 獨立 chunk + TrendPage lazy load（主 bundle 641kB→121kB）
  - UI 暖色黏土風改版（f0fa6bf，ui-ux-pro-max）：暖橘色 token、愛心/星星/雲朵背景、Fredoka + Nunito + Huninn 圓體、SVG tab icon + 自繪寶寶臉、clay 卡片按鈕、reduced-motion
  - web-design-guidelines 修正（b65c80b）：label htmlFor、aria-live/pressed/alert、div onClick→button、tab hash 深連結、touch-action、hover 狀態等
  - iOS 小怪獸 icon 套用到 web（9659093）：sips 產 192/512/apple-touch/favicon，補 favicon link，刪無用 icon.svg
  - 大便色卡依實體卡照片重新取樣（8b577a1）：web+iOS 同步，8 號綠→橘黃、9 號棕→黃綠，全黑字；web 61/61、iOS 47/47
- 測試 web 61/61、iOS 47/47；Pages 部署驗證正常：https://wsturkey6-hash.github.io/BabyMonster/
- 原始 Spec：`docs/superpowers/specs/2026-07-14-babymonster-design.md`；Plan：`docs/superpowers/plans/2026-07-15-babymonster-implementation.md`

## 已完成
- [x] 需求釐清與設計（brainstorming）
- [x] Spec 撰寫並提交
- [x] git init + 設定 GitHub 遠端 origin
- [x] `.claude/settings.json`（autoCompact + SessionStart hook）+ 初始 PROGRESS.md
- [x] writing-plans 制定實作計劃（12 Task）

## 待辦（實作 Task，subagent-driven）
- [x] Task 1：專案骨架（手寫 pbxproj，xcodebuild 驗證）✅ 審查通過 commit 3497869
- [x] Task 2：Enums + StoolColorCard（TDD）✅ 6 tests passed
- [x] Task 3：領域值型別 RecordData/ProfileData（TDD）✅ commit d0a90f2
- [x] Task 4：DailyStats（TDD）✅ commit beee32f（曾遇 server 錯誤，已重跑）
- [x] Task 5：BabyAge（TDD）✅ commit 2645c66
- [x] Task 6：DataTransfer 匯出/匯入/合併（TDD）✅ commit 7999458
- [x] Task 7：SwiftData Entities + 對應（TDD）✅ commit 8f488c8（24/24 tests）
- [x] Task 8：記錄頁（表單 + 今日時間軸）✅ commit 049e85f
- [x] Task 9：每日統計頁 ✅ commit 3c960d8
- [x] Task 10：趨勢頁（Swift Charts）+ TrendSeries（TDD）✅ commit c9e9464（27/27 tests）
- [x] Task 11：設定頁（名字/生日/年齡/匯出匯入）✅ commit 596feef
- [x] Task 12：整合 ModelContainer + 端對端驗證 ✅ commit 3e1c6a9（模擬器啟動驗證通過）
- [x] 最終整支 branch 審查（Opus）+ 修正 wave ✅ commit 834e0d7（share sheet、Bristol 附註、對比、清理死碼）

## 專案狀態：實作完成 ✅（12/12 tasks + 審查 + 修正皆完成，27/27 測試通過，App 模擬器啟動正常）
下一步：由使用者決定合併 / 開 PR / 推 GitHub（推送需明確同意）。

## 派工原則（Orchestrator）
- Opus 調度；純邏輯 TDD 任務（2–7,10 邏輯）派 **Sonnet**；骨架/視圖接線等機械性任務可派 **Haiku**，較繁複的視圖（Task 8/10/11）派 **Sonnet**。

## 多寶寶功能完成 ✅（feature/multi-baby，8/8 tasks）
- Task 1–2：ProfileEntity/RecordEntity 多寶寶欄位（`babyId`）+ `LegacyMigration`（v1→v2 一次性歸屬、冪等、id 去重）
- Task 3：`CurrentBaby.resolve(storedId:profileIds:)` 目前寶寶解析邏輯
- Task 4：`BackupPayloadV2` + `DataTransfer.encodeV2/decodeAny/mergeBabies`（v1 相容、id/名字對中合併）
- Task 5–6：`BabyPickerMenu` 切換器（無寶寶時隱藏）+ 記錄/統計/趨勢頁依目前寶寶過濾
- Task 7：設定頁寶寶清單管理（新增/編輯/刪除，刪除連帶清記錄）
- Task 8：匯出範圍選擇（全部寶寶／單一寶寶 confirmationDialog）、匯入走 v2 合併並提示「已匯入並合併：寶寶 X 位、共 Y 筆記錄」、`RootTabView` 加 `.task { try? LegacyMigration.run(context:) }` 啟動遷移接線
- 測試：44/44 全數通過；模擬器 e2e 驗證 4 分頁正常啟動、無 crash

## 網頁版（PWA）實作完成 ✅（14/14 tasks）
- 動機：太太不想開開發者模式側載、不想 7 天重裝 → 純前端 PWA（加入主畫面即像 App、資料持久）
- Spec：`docs/superpowers/specs/2026-07-18-babymonster-web-design.md`（已核可）
- Plan：`docs/superpowers/plans/2026-07-18-babymonster-web-implementation.md`（14 Task，React+TS+Vite+Dexie+Recharts，邏輯層 TDD 鏡射 iOS）
- 關鍵決策：直接做多寶寶 v2（iOS 已同步完成 v2，PR #3）；匯出 ISO 8601 無毫秒（Swift .iso8601 相容）；GitHub Pages 同 repo `web/` 部署
- [x] Task 1–14 完成（詳細 commit 對照見 .superpowers/sdd/progress.md）
- [x] 最終整支 branch 審查（Opus）+ 修正 wave ✅ commit f3239c5（Critical：UUID 大小寫正規化 — Swift 匯出大寫、web 需不分大小寫合併；Important：NaN 日期防護），50/50 tests
- [x] 已合併回 main（b5975b3）並推送 GitHub（使用者同意）；worktree 與 feature/web 已清理
- 部署網址：https://wsturkey6-hash.github.io/BabyMonster/ ；首次需在 repo Settings → Pages 選 Source = GitHub Actions（使用者操作），之後 push web/** 自動部署
- 延後項目（post-merge）：全部完成 ✅（2026-07-20，commit 4fdea17）

## 重要決策備忘
- 單一寶寶、純本機 SwiftData、iOS 17+、Swift Charts、XCTest
- 手動 JSON 匯出/匯入（LINE 傳輸），以 record id 聯集去重
- 統計即時計算（一天 = 00:00–23:59）
- 大便卡 1–9（1–6 異常）、布里斯托 1–7、體重單位公克、名字預設 BabyMonster、記生日算年齡
- 編排：Opus 調度，Sonnet/Haiku 執行
- 推送 GitHub 需使用者逐次明確同意
