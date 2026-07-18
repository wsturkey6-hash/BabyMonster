# BabyMonster 專案進度

> 每完成一個任務就更新此檔。SessionStart 會自動載入本檔，撞到用量上限 reset 後可據此接續。

## 目前狀態
- 階段：**準備執行**（brainstorming + writing-plans 完成）
- Spec：`docs/superpowers/specs/2026-07-14-babymonster-design.md`（已核可）
- Plan：`docs/superpowers/plans/2026-07-15-babymonster-implementation.md`（12 個 Task）

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

## 重要決策備忘
- 單一寶寶、純本機 SwiftData、iOS 17+、Swift Charts、XCTest
- 手動 JSON 匯出/匯入（LINE 傳輸），以 record id 聯集去重
- 統計即時計算（一天 = 00:00–23:59）
- 大便卡 1–9（1–6 異常）、布里斯托 1–7、體重單位公克、名字預設 BabyMonster、記生日算年齡
- 編排：Opus 調度，Sonnet/Haiku 執行
- 推送 GitHub 需使用者逐次明確同意
