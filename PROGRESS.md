# BabyMonster 專案進度

> 每完成一個任務就更新此檔。SessionStart 會自動載入本檔，撞到用量上限 reset 後可據此接續。

## 目前狀態（2026-08-10 更新）
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
