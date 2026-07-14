# BabyMonster 專案進度

> 每完成一個任務就更新此檔。SessionStart 會自動載入本檔，撞到用量上限 reset 後可據此接續。

## 目前狀態
- 階段：**規劃**（brainstorming 完成，準備 writing-plans）
- Spec：`docs/superpowers/specs/2026-07-14-babymonster-design.md`（已核可）

## 已完成
- [x] 需求釐清與設計（brainstorming）
- [x] Spec 撰寫並提交
- [x] git init + 設定 GitHub 遠端 origin

## 進行中
- [ ] 建立 `.claude/settings.json`（autoCompact + SessionStart hook）
- [ ] writing-plans 制定實作計劃

## 待辦（實作，尚未開始）
- [ ] 專案骨架（XcodeGen / project.yml）
- [ ] 資料模型（BabyProfile, Record, Enums, StoolColorCard）
- [ ] 純邏輯 + 測試（DailyStats, BabyAge, DataTransfer）
- [ ] 畫面（Record / DailyStats / Trend / Settings / RootTab）
- [ ] 驗證與整合

## 重要決策備忘
- 單一寶寶、純本機 SwiftData、iOS 17+、Swift Charts、XCTest
- 手動 JSON 匯出/匯入（LINE 傳輸），以 record id 聯集去重
- 統計即時計算（一天 = 00:00–23:59）
- 大便卡 1–9（1–6 異常）、布里斯托 1–7、體重單位公克、名字預設 BabyMonster、記生日算年齡
- 編排：Opus 調度，Sonnet/Haiku 執行
- 推送 GitHub 需使用者逐次明確同意
