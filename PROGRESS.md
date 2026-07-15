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
- [ ] Task 12：整合 ModelContainer + 端對端驗證（進行中）

## 派工原則（Orchestrator）
- Opus 調度；純邏輯 TDD 任務（2–7,10 邏輯）派 **Sonnet**；骨架/視圖接線等機械性任務可派 **Haiku**，較繁複的視圖（Task 8/10/11）派 **Sonnet**。

## 重要決策備忘
- 單一寶寶、純本機 SwiftData、iOS 17+、Swift Charts、XCTest
- 手動 JSON 匯出/匯入（LINE 傳輸），以 record id 聯集去重
- 統計即時計算（一天 = 00:00–23:59）
- 大便卡 1–9（1–6 異常）、布里斯托 1–7、體重單位公克、名字預設 BabyMonster、記生日算年齡
- 編排：Opus 調度，Sonnet/Haiku 執行
- 推送 GitHub 需使用者逐次明確同意
