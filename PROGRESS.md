# BabyMonster 專案進度

> 每完成一個任務就更新此檔。SessionStart 會自動載入本檔，撞到用量上限 reset 後可據此接續。

## 目前狀態（2026-07-20 更新）
- 階段：**三大里程碑 + 延後項目 + UI 可愛改版全部完成**
- 2026-07-20 完成：
  - 延後項目 7/7（4fdea17）：iOS 實匯出檔 fixture 測試（用真 Swift 程式碼編譯產生 fixture、雙向相容驗證、修 v1 profile id 保留）、totalFeed 小數格式（formatNumber）、刪寶寶後匯出範圍重設、share 失敗退回下載、toast 計時器、PR 觸發 CI（web-ci.yml）、recharts 獨立 chunk + TrendPage lazy load（主 bundle 641kB→121kB）
  - UI 暖色黏土風改版（f0fa6bf，ui-ux-pro-max）：暖橘色 token、愛心/星星/雲朵背景、Fredoka + Nunito + Huninn 圓體、SVG tab icon + 自繪寶寶臉、clay 卡片按鈕、reduced-motion
  - web-design-guidelines 修正（b65c80b）：label htmlFor、aria-live/pressed/alert、div onClick→button、tab hash 深連結、touch-action、hover 狀態等
- 測試 60/60；Pages 部署驗證正常：https://wsturkey6-hash.github.io/BabyMonster/
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
