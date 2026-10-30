# BabyMonster 專案進度

> 每完成一個任務就更新此檔。SessionStart 會自動載入本檔，撞到用量上限 reset 後可據此接續。

## 2026-10-29：副食品（整合 babyfoodie）
- Spec：`docs/superpowers/specs/2026-10-29-baby-food-design.md`
- 分頁改成「記錄｜統計｜副食品｜疫苗｜設定」：「每日統計」與「趨勢」合併成「統計」（每日／趨勢／生長曲線），舊的 `#stats`、`#trend` 網址照樣能用
- 副食品：紀錄（食材可複選、份量、反應、備註，存檔時標「第一次」，有反應時詢問要標記哪些食材）＋ 試敏表（118 項，三種狀態，自動捲到目前月齡）
- 自訂食材不另外存，從紀錄與標記推出（spec §4.3）
- 資料：Dexie v4 新增 `foodRecords`、`foodMarks`；備份檔仍是 version 2，只加選填欄位，沒用副食品時匯出逐字節不變
- **同步相容（重要）**：舊版客戶端的 `tableOf()` 把不認得的種類當成接種紀錄。現在客戶端在請求帶 `kinds`，伺服器只送對方認得的種類；新版第一次同步會把游標歸零重拉一次（`kindsVersion`）
- **部署順序：先部署伺服器，再合併網頁**。伺服器沒更新前，新版網頁上傳的副食品會被拒收並留在 outbox（不會遺失），伺服器更新後自動補傳
- 順手修掉：recharts chunk 夾帶 react，導致啟動就載入整個圖表庫（gzip 150 KB）；現在只有打開趨勢／生長曲線才下載
- babyfoodie 舊資料不搬；上線後到 babyfoodie repo 的 Settings → Pages 關掉網站（要使用者操作）
- 測試數：web 383 → 409、server 115 → 121

## 2026-10-29：移除 iOS 原生版
- 網頁版（PWA）比 iOS app 方便，刪除 `BabyMonster/`、`BabyMonster.xcodeproj/`、`BabyMonsterTests/`
- `scripts/generate-growth-reference.mjs` 只產出 web 的 `.ts`；CI 拿掉 `.swift` 路徑
- **保留** web 匯入 iOS 匯出檔的相容邏輯（大寫 UUID、v1 檔、無毫秒 ISO 8601）與其 fixture 測試，舊備份仍可匯入
- 以下歷史紀錄中的 iOS 內容僅供參考；程式碼可從 git 歷史找回

## 目前狀態（2026-08-19 更新）
- 階段：**身高／頭圍記錄 + 生長曲線完成**（feature/growth-metrics，web + iOS 同步）
- Spec：`docs/superpowers/specs/2026-08-19-growth-metrics-design.md`
- 功能：
  1. 記錄頁新增身高、頭圍欄位；趨勢頁指標多了平均身高／平均頭圍
  2. 趨勢頁改成「日常趨勢／生長曲線」兩種模式（**不新增第 6 個分頁** —— iPhone TabView 超過 5 個會被收進 More）
  3. 生長曲線畫 P3/P15/P50/P85/P97 五條參考線 + 寶寶歷次測量點，三個指標的百分位各自標註測量日期（身高體重常不是同一天量的）
- 寶寶資料新增 `sex`（選填，male/female）—— 生長曲線男女參考值完全不同，沒設定時該頁顯示引導，其他頁面不受影響
- 測試數：web **132 → 202**、iOS **97 → 165**，全數通過

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

### 2026-08-19 後續：百分位區間標籤少切一刀（已修）
使用者回報「體重第 19 百分位」和「頭圍第 52 百分位」都顯示成同一個區間「第 15–85 百分位（中段）」，
跟圖上看到的落點對不起來 —— 圖畫了五條參考線，標籤卻只切成四段。

- 修法：`bandLabel` 在 P50 再切一刀，六段對齊五條參考線：
  `低於第 3`／`第 3–15`／`第 15–50`／`第 50–85`／`第 85–97`／`高於第 97`
  - 每條線本身歸入「它開啟的那一段」（P50 → 第 50–85），兩平台測試都釘住這個邊界
- **順手修掉讓這個 bug 溜過測試的結構問題**：web 的 `bandLabel`／`formatPercentile` 原本寫在
  `TrendPage.tsx` 裡（UI 檔，沒測試），iOS 則在 `GrowthChart.swift`（邏輯層，有測試）。
  已把 web 那兩個函式搬到 `web/src/logic/growthChart.ts`，兩平台結構對稱、兩邊都有測試
- 新增測試包含「六段互不重疊也不留空隙」的掃描（0→100 逐 0.05 掃，確認剛好出現 6 段且不重複），
  以後再改邊界只要漏一段就會紅
- 兩平台都用同一筆資料實測過（女寶、45 日齡、4.60kg／55.0cm／37.6cm →
  第 45／42／55 百分位 → 第 15–50／15–50／50–85 百分位），web 在瀏覽器、iOS 在模擬器都真的點過

### 2026-09-12 後續：web 點清單進編輯，畫面完全沒反應（已修）
手機上記錄頁的表單卡片很長，清單在它下面。捲到清單點某一筆時，上方表單確實
被填入了那筆資料、標題變「編輯記錄」、按鈕變「儲存變更」—— 但**畫面不會捲回表單**，
表單整個在畫面外，使用者看到的東西一模一樣（實測前後截圖逐像素相同）。

- 後果很嚴重：使用者之後捲上去以為在「新增」，`save()` 用 `editing?.id` + `db.records.put(rec)`
  會把原本那筆**整個蓋掉**（例如把前一晚的「入睡」蓋成早上的「起床」，
  那段跨夜睡眠就從睡眠統計裡消失）
- 修法：`RecordPage.tsx` 新增 `startEditing(r)` 取代原本的 `onClick={() => setEditing(r)}`，
  在 `requestAnimationFrame` 裡把表單卡片 `scrollIntoView({ block: 'start' })` 並把焦點移到表單標題
  - 用 rAF 是為了等 React 把標題換成「編輯記錄」之後才捲動／移焦點，讀螢幕軟體才唸得到正確標題
  - 尊重 `prefers-reduced-motion`：reduce 時 `behavior: 'auto'`（不做動畫），否則 `smooth`
  - 焦點用 `focus({ preventScroll: true })`，否則瀏覽器會自己跳過去、打斷平滑捲動
  - 焦點放**標題**而非時間欄位：iOS Safari 聚焦 `datetime-local` 會直接彈出日期轉盤蓋住畫面
  - `.card` 加 `scroll-margin-top: 12px`，捲到定位時上方留白跟 `.page` 的 padding 一致
- **寫在 click handler 而不是 `useEffect([editing])`**：同一筆記錄再點一次時 `editing` 沒變，
  effect 不會重跑就不會捲動；實測已涵蓋這個情境
- 驗證（mobile 375×812 真的用點的）：點 21:00「入睡」那筆 → scrollY 1310 → 94、
  表單 top = 12、標題「編輯記錄」、時間欄位 21:00、入睡按鈕呈選取、`document.activeElement` 是標題 h2
  - 另外實測：reduce motion 分支確實傳 `behavior: 'auto'`；儲存變更仍是就地更新（10 筆不變，100→177 ml）；
    「取消編輯」仍正確清空。web 202 tests 全過、`npm run build` 乾淨
- iOS 同步檢查結果：**不受影響，不需修改**。iOS 的表單是 modal sheet（`.sheet(item: $editing)`），
  一定蓋在畫面上不可能沒看到；而且新增走 `context.insert(RecordEntity(...))`、
  編輯走 `entity.apply(data)`，是兩條不同的路徑，不存在 put 覆蓋的問題
  - 唯一小落差：編輯與新增的 sheet 標題都是「記錄」，沒像 web 一樣寫「編輯記錄」。
    因為欄位已預填、使用者不會誤判，這次**沒有動它**

**教訓：狀態變了不等於使用者看得到。** 表單在清單上方的版面，進編輯一定要把表單帶到眼前。

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

### 2026-09-12：每日統計加上喝奶量達標條
每日統計的「總喝奶量」下面多一條進度條，一眼看出當天有沒有喝夠。

- 目標量 = **最近一次填的體重（kg）× 100 ml**（體重存的是 g，所以先乘 100 再除以 1000；
  先乘再除是為了避開 `5100 / 1000 * 100 = 509.999…` 這種浮點誤差，兩平台都一樣）
- 「最近一次」的取法：先找**選定日結束前最後一筆**體重；那天之前都還沒量過，就退而用**第一筆**體重。
  這樣事後才補記體重時，先前那幾天也看得到目標，而不是一片空白
- 完全沒有體重記錄時不畫條，顯示「記一次體重就會算出最少奶量」
- 達標前橘色（差多少 ml）、達標後綠色（已達標）；條子最多畫到 100%，喝超過不會爆出去
- **沒有塞進 `dailySummary`／`DailySummary`**：那個函式是「只看當天」的彙總，
  而趨勢頁會對範圍內每一天各呼叫一次；把跨日的體重查詢放進去會變成 O(n²)。
  改成獨立的 `feedTarget(dayMs, records)` / `DailyStats.feedTarget(for:records:)`，由頁面各自組合
- 測試數：web **202 → 207**、iOS **165 → 170**，全數通過
- 兩平台都真的操作過：web 在瀏覽器（375×812）看未達標 400/525 與達標 600/525；
  iOS 在模擬器實際輸入 400 ml + 5250 g 再補 200 ml，橘條→綠條都正確

#### ⚠️ OneDrive 衝突副本會讓 iOS build 直接失敗
`xcodebuild` 第一次跑就紅，錯誤是 `Invalid redeclaration of 'BabyMonsterApp'` 等一堆重複宣告 ——
兇手是 OneDrive 產生的 `*-Willy.swift` 衝突副本（26 個，未追蹤，2026-08-18 的舊快照）。
Xcode 專案用的是 `PBXFileSystemSynchronizedRootGroup`，**資料夾裡每個 .swift 都會被編**，
所以這些副本一出現就等於整份原始碼被宣告兩次。
**已於 2026-09-13 全部刪除**（51 個未追蹤檔：26 個 Swift、web 的 `*-Willy.ts/tsx/css`、
`-Willy.gitignore`、`PROGRESS-Willy.md` 等）。刪除前逐檔比對過，內容都是已 commit 檔案的舊快照，
沒有任何獨有的東西；刪完 `xcodebuild test` 直接綠（170 個測試全過）。
以後 OneDrive 再生一批出來時，症狀就是 iOS 一 build 就滿江紅的重複宣告錯誤，刪掉即可。
