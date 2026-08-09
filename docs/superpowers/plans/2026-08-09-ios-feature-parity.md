# iOS 追平網頁版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 iOS 版補上網頁版已經有、iOS 還沒有的五項功能：小便量、睡眠追蹤與當日總時數、當日備註、記錄清單可看往前幾天、疫苗頁。

**Architecture:** 沿用專案既有分層 —— `Models/`（值型別 + SwiftData entity）、`Logic/`（純函式，XCTest 覆蓋）、`Views/`（SwiftUI）。新欄位一律 optional，SwiftData 走輕量遷移不需要 migration plan。疫苗時程是靜態資料 + 純函式推算，不進資料庫。

**Tech Stack:** Swift 5.0、SwiftUI、SwiftData、XCTest、iOS 17.0 部署目標。

## Global Constraints

- 專案為 Xcode 16 格式（`objectVersion = 77`）並使用 `PBXFileSystemSynchronizedRootGroup`。**新增 .swift 檔只要放進 `BabyMonster/` 或 `BabyMonsterTests/` 資料夾即可，不需要編輯 project.pbxproj。**
- 建置與測試指令固定為：
  `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
  （模擬器名稱依本機 `xcrun simctl list devices available` 調整。）
- 起始測試數為 47。本計劃結束時應為 47 + 新增測試數，且全數通過。
- 匯出 JSON 的欄位名稱必須與網頁版完全一致（`urineAmount`、`sleep`），值也一致（`few`/`medium`/`many`、`start`/`end`），否則兩邊互傳會掉資料。
- 新增欄位一律 optional 且有預設 `nil`，確保既有 SwiftData 資料庫可直接開啟。
- 不要改動 `StoolColorCard`、`TrendSeries`、`LegacyMigration`、`CurrentBaby` 的既有行為。

## 兩個刻意的平台差異（不要照抄網頁版）

1. **記錄頁的日期切換**：網頁版的逐筆清單跟著表單裡的「時間」欄位走，因為兩者在同一頁。iOS 的新增/編輯表單是 modal sheet，做不到同樣的連動。iOS 改用**清單頁自己的日期選擇器**（Task 6），達成一樣的目的：看得到往前幾天的逐筆記錄。
2. **不要移植的兩項**：網頁版的自繪確認對話框（為了避開 Safari 顯示 GitHub 網域）與日期輸入框 CSS 修正，都是純瀏覽器問題，iOS 沒有對應物，不要找、不要做。
3. **月底出生的接種日算法兩邊不同**：網頁版用 JS `Date` 的溢位語意（1/31 加一個月 → 3/3），iOS 用 `Calendar.date(byAdding: .month)` 會夾到月底（1/31 加一個月 → 2/28）。iOS 的行為對接種日來說比較合理，因此**刻意不對齊**，也不要為此寫斷言 3/3 的測試。

---

### Task 1: `Amount` 更名與小便量欄位

`StoolAmount` 現在要同時給大便量與小便量使用，名稱不再準確，更名為 `Amount`。rawValue（`few`/`medium`/`many`）不變，所以既有資料與匯出檔完全相容。

**Files:**
- Modify: `BabyMonster/Models/Enums.swift:3-13`
- Modify: `BabyMonster/Models/RecordData.swift:8`
- Modify: `BabyMonster/Models/RecordEntity.swift`
- Modify: `BabyMonster/Views/RecordEntryForm.swift:10,25,50-53,105`
- Test: `BabyMonsterTests/DataTransferV2Tests.swift`

**Interfaces:**
- Consumes: 無
- Produces: `enum Amount: String, Codable, CaseIterable, Identifiable`（`.few`/`.medium`/`.many`，`displayName` 為 少/中/多）；`RecordData.urineAmount: Amount?`；`RecordEntity.urineAmountRaw: String?`

- [ ] **Step 1: 寫失敗的測試**

在 `BabyMonsterTests/DataTransferV2Tests.swift` 的 class 內加入：

```swift
func testUrineAmountRoundTripsThroughV2() throws {
    let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
    var r = rec(UUID(), 1000, baby: baby.id, feed: 100)
    r.hasUrine = true
    r.urineAmount = .many
    let payload = BackupPayloadV2(profiles: [baby], records: [r])
    let decoded = try DataTransfer.decodeAny(DataTransfer.encodeV2(payload))
    XCTAssertEqual(decoded.records.first?.urineAmount, .many)
}

func testUrineAmountUsesWebCompatibleJSONKeyAndValue() throws {
    let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
    var r = rec(UUID(), 1000, baby: baby.id)
    r.hasUrine = true
    r.urineAmount = .medium
    let json = String(data: try DataTransfer.encodeV2(
        BackupPayloadV2(profiles: [baby], records: [r])), encoding: .utf8)!
    XCTAssertTrue(json.contains("\"urineAmount\" : \"medium\""))
}

func testDecodesFileWithoutUrineAmount() throws {
    let json = """
    {"version":2,
     "profiles":[{"id":"11111111-1111-1111-1111-111111111111","name":"小明",
                  "birthDate":"2025-11-02T00:00:00Z"}],
     "records":[{"id":"22222222-2222-2222-2222-222222222222",
                 "babyId":"11111111-1111-1111-1111-111111111111",
                 "timestamp":"2026-01-01T08:00:00Z","hasUrine":true}]}
    """.data(using: .utf8)!
    let v2 = try DataTransfer.decodeAny(json)
    XCTAssertNil(v2.records.first?.urineAmount)
}
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 編譯失敗，`value of type 'RecordData' has no member 'urineAmount'`

- [ ] **Step 3: 更名 enum**

把 `BabyMonster/Models/Enums.swift` 開頭的 `StoolAmount` 整段換成：

```swift
/// 量的多寡刻度，大便量與小便量共用。rawValue 與網頁版一致。
enum Amount: String, Codable, CaseIterable, Identifiable {
    case few, medium, many
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .few: return "少"
        case .medium: return "中"
        case .many: return "多"
        }
    }
}
```

- [ ] **Step 4: 更新 RecordData**

`BabyMonster/Models/RecordData.swift` 的 `stoolAmount` 型別改為 `Amount?`，並在 `hasUrine` 後面加一行：

```swift
    var stoolAmount: Amount?
    var stoolShape: BristolType?
    var hasUrine: Bool
    var urineAmount: Amount?     // 只有 hasUrine 為 true 時才有意義
```

- [ ] **Step 5: 更新 RecordEntity**

`BabyMonster/Models/RecordEntity.swift`：加 `urineAmountRaw` 屬性、init 參數（給預設值 `nil` 讓既有呼叫端不必全改）、`convenience init(data:)`、`apply(_:)`、`data` 四處對應。

```swift
    var hasUrine: Bool
    var urineAmountRaw: String?
    var temperature: Double?
```

init 簽章改為（新參數放最後、有預設值）：

```swift
    init(id: UUID, timestamp: Date, feedAmount: Double?, stoolColor: Int?,
         stoolAmountRaw: String?, stoolShapeRaw: Int?, hasUrine: Bool,
         temperature: Double?, weight: Double?, note: String?, babyId: UUID? = nil,
         urineAmountRaw: String? = nil) {
        self.id = id; self.timestamp = timestamp; self.feedAmount = feedAmount
        self.stoolColor = stoolColor; self.stoolAmountRaw = stoolAmountRaw; self.stoolShapeRaw = stoolShapeRaw
        self.hasUrine = hasUrine; self.temperature = temperature; self.weight = weight; self.note = note
        self.babyId = babyId; self.urineAmountRaw = urineAmountRaw
    }
```

`convenience init(data:)` 最後補 `urineAmountRaw: data.urineAmount?.rawValue`；`apply(_:)` 補一行 `urineAmountRaw = data.urineAmount?.rawValue`；`data` 的 `RecordData(...)` 補 `urineAmount: urineAmountRaw.flatMap(Amount.init(rawValue:))`。

- [ ] **Step 6: 修正 RecordEntryForm 的型別名稱**

`BabyMonster/Views/RecordEntryForm.swift` 內所有 `StoolAmount` 換成 `Amount`（第 10、25 行的 state 與 init，第 50–53 行的 Picker，共 5 處）。

- [ ] **Step 7: 跑測試確認通過**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 50 tests passed（47 + 3）

- [ ] **Step 8: Commit**

```bash
git add BabyMonster/Models BabyMonster/Views/RecordEntryForm.swift BabyMonsterTests/DataTransferV2Tests.swift
git commit -m "Rename StoolAmount to Amount and record urine amount"
```

---

### Task 2: 睡眠事件與時長計算

睡眠不存時長，存事件：入睡一筆、起床一筆，配對後才算時長。跨夜的睡眠依午夜切分給兩天，讓單日總和不會超過 24 小時，也和 App 既有的「一天 = 00:00–23:59」一致。

**Files:**
- Modify: `BabyMonster/Models/Enums.swift`（檔尾新增）
- Modify: `BabyMonster/Models/RecordData.swift`
- Modify: `BabyMonster/Models/RecordEntity.swift`
- Create: `BabyMonster/Logic/Sleep.swift`
- Create: `BabyMonsterTests/SleepTests.swift`
- Modify: `BabyMonsterTests/DataTransferV2Tests.swift`

**Interfaces:**
- Consumes: Task 1 的 `RecordData`
- Produces: `enum SleepEvent: String, Codable, CaseIterable, Identifiable`（`.start`/`.end`）；`RecordData.sleep: SleepEvent?`；`RecordEntity.sleepRaw: String?`；`struct SleepInterval: Equatable { var start: Date; var end: Date }`；`Sleep.intervals(records:) -> [SleepInterval]`；`Sleep.dailyMinutes(for:records:calendar:) -> Int`

- [ ] **Step 1: 寫失敗的測試**

Create `BabyMonsterTests/SleepTests.swift`：

```swift
import XCTest
@testable import BabyMonster

final class SleepTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    func rec(_ date: Date, _ sleep: SleepEvent? = nil) -> RecordData {
        var r = RecordData(id: UUID(), timestamp: date, feedAmount: nil, stoolColor: nil,
                           stoolAmount: nil, stoolShape: nil, hasUrine: false,
                           temperature: nil, weight: nil, note: nil)
        r.sleep = sleep
        return r
    }

    func testPairsStartWithFollowingEnd() {
        let records = [rec(at(2026, 7, 26, 20), .start), rec(at(2026, 7, 26, 22), .end)]
        XCTAssertEqual(Sleep.intervals(records: records),
                       [SleepInterval(start: at(2026, 7, 26, 20), end: at(2026, 7, 26, 22))])
    }

    func testSortsBeforePairing() {
        let records = [rec(at(2026, 7, 26, 22), .end), rec(at(2026, 7, 26, 20), .start)]
        XCTAssertEqual(Sleep.intervals(records: records).count, 1)
    }

    func testRepeatedStartKeepsEarliest() {
        let records = [rec(at(2026, 7, 26, 20), .start),
                       rec(at(2026, 7, 26, 20, 30), .start),
                       rec(at(2026, 7, 26, 22), .end)]
        XCTAssertEqual(Sleep.intervals(records: records),
                       [SleepInterval(start: at(2026, 7, 26, 20), end: at(2026, 7, 26, 22))])
    }

    func testEndWithoutStartIsIgnored() {
        let records = [rec(at(2026, 7, 26, 7), .end),
                       rec(at(2026, 7, 26, 20), .start),
                       rec(at(2026, 7, 26, 22), .end)]
        XCTAssertEqual(Sleep.intervals(records: records),
                       [SleepInterval(start: at(2026, 7, 26, 20), end: at(2026, 7, 26, 22))])
    }

    func testUnfinishedSleepProducesNoInterval() {
        let records = [rec(at(2026, 7, 26, 13), .start), rec(at(2026, 7, 26, 14), .end),
                       rec(at(2026, 7, 26, 20), .start)]
        XCTAssertEqual(Sleep.intervals(records: records),
                       [SleepInterval(start: at(2026, 7, 26, 13), end: at(2026, 7, 26, 14))])
    }

    func testRecordsWithoutSleepAreIgnored() {
        XCTAssertTrue(Sleep.intervals(records: [rec(at(2026, 7, 26, 8)), rec(at(2026, 7, 26, 9))]).isEmpty)
    }

    func testWholeNapCountsOnItsDay() {
        let records = [rec(at(2026, 7, 26, 13), .start), rec(at(2026, 7, 26, 14, 30), .end)]
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26), records: records, calendar: cal), 90)
    }

    func testOvernightSleepSplitsAtMidnight() {
        let records = [rec(at(2026, 7, 26, 20), .start), rec(at(2026, 7, 27, 6), .end)]
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26), records: records, calendar: cal), 4 * 60)
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 27), records: records, calendar: cal), 6 * 60)
    }

    func testSleepSpanningAFullDayCountsTwentyFourHours() {
        let records = [rec(at(2026, 7, 26, 22), .start), rec(at(2026, 7, 28, 2), .end)]
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26), records: records, calendar: cal), 2 * 60)
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 27), records: records, calendar: cal), 24 * 60)
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 28), records: records, calendar: cal), 2 * 60)
    }

    func testMultipleSleepsOnOneDayAreSummed() {
        let records = [rec(at(2026, 7, 26, 9), .start), rec(at(2026, 7, 26, 10), .end),
                       rec(at(2026, 7, 26, 13), .start), rec(at(2026, 7, 26, 15), .end)]
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26), records: records, calendar: cal), 180)
    }

    func testNoSleepReturnsZero() {
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26), records: [], calendar: cal), 0)
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26),
                                          records: [rec(at(2026, 7, 26, 8), .start)], calendar: cal), 0)
    }

    func testAnyTimeOnTheDayGivesSameResult() {
        let records = [rec(at(2026, 7, 26, 20), .start), rec(at(2026, 7, 27, 6), .end)]
        XCTAssertEqual(Sleep.dailyMinutes(for: at(2026, 7, 26, 23, 59), records: records, calendar: cal), 4 * 60)
    }
}
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 編譯失敗，`cannot find 'Sleep' in scope`

- [ ] **Step 3: 新增 SleepEvent enum**

在 `BabyMonster/Models/Enums.swift` 檔尾加：

```swift
/// 睡眠以事件記錄：入睡一筆、起床一筆，配對後才算出時長。
enum SleepEvent: String, Codable, CaseIterable, Identifiable {
    case start, end
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .start: return "入睡"
        case .end: return "起床"
        }
    }
    var systemImage: String {
        switch self {
        case .start: return "moon.zzz.fill"
        case .end: return "sun.max.fill"
        }
    }
}
```

- [ ] **Step 4: 加欄位到 RecordData 與 RecordEntity**

`RecordData.swift` 在 `note` 之後加 `var sleep: SleepEvent?`。

`RecordEntity.swift` 加 `var sleepRaw: String?` 屬性、init 參數 `sleepRaw: String? = nil`（放在 `urineAmountRaw` 之後）與 `self.sleepRaw = sleepRaw`；`convenience init(data:)` 補 `sleepRaw: data.sleep?.rawValue`；`apply(_:)` 補 `sleepRaw = data.sleep?.rawValue`；`data` 內先建出 `RecordData` 再補指派：

```swift
    var data: RecordData {
        var d = RecordData(id: id, timestamp: timestamp, feedAmount: feedAmount, stoolColor: stoolColor,
                           stoolAmount: stoolAmountRaw.flatMap(Amount.init(rawValue:)),
                           stoolShape: stoolShapeRaw.flatMap(BristolType.init(rawValue:)),
                           hasUrine: hasUrine,
                           urineAmount: urineAmountRaw.flatMap(Amount.init(rawValue:)),
                           temperature: temperature, weight: weight, note: note,
                           babyId: babyId)
        d.sleep = sleepRaw.flatMap(SleepEvent.init(rawValue:))
        return d
    }
```

> 注意：`RecordData` 的 memberwise init 參數順序必須與屬性宣告順序一致。若上面的呼叫編譯不過，以實際宣告順序為準調整具名參數順序。

- [ ] **Step 5: 實作 Sleep**

Create `BabyMonster/Logic/Sleep.swift`：

```swift
import Foundation

struct SleepInterval: Equatable {
    var start: Date
    var end: Date
}

enum Sleep {
    /// 依時間由早到晚配對入睡／起床。
    /// 已經有一段開著時的重複「入睡」會被忽略（以最早那次為準）；
    /// 沒有對應入睡的「起床」也忽略；最後還開著的那段（還在睡或忘了記）不產生區間。
    static func intervals(records: [RecordData]) -> [SleepInterval] {
        let events = records
            .filter { $0.sleep != nil }
            .sorted { $0.timestamp < $1.timestamp }

        var result: [SleepInterval] = []
        var openStart: Date?

        for e in events {
            if e.sleep == .start {
                if openStart == nil { openStart = e.timestamp }
            } else if let s = openStart {
                result.append(SleepInterval(start: s, end: e.timestamp))
                openStart = nil
            }
        }
        return result
    }

    /// 選定當天 [00:00, 隔天 00:00) 與各段睡眠的重疊分鐘數總和（跨夜以午夜切分）。
    static func dailyMinutes(for date: Date, records: [RecordData],
                             calendar: Calendar = .current) -> Int {
        let dayStart = calendar.startOfDay(for: date)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return 0 }

        let seconds = intervals(records: records).reduce(0.0) { sum, s in
            let from = max(s.start, dayStart)
            let to = min(s.end, dayEnd)
            return sum + max(0, to.timeIntervalSince(from))
        }
        return Int((seconds / 60).rounded())
    }
}
```

- [ ] **Step 6: 加匯出往返測試**

在 `BabyMonsterTests/DataTransferV2Tests.swift` 加：

```swift
func testSleepRoundTripsWithWebCompatibleValue() throws {
    let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
    var r = rec(UUID(), 1000, baby: baby.id)
    r.sleep = .start
    let data = try DataTransfer.encodeV2(BackupPayloadV2(profiles: [baby], records: [r]))
    XCTAssertTrue(String(data: data, encoding: .utf8)!.contains("\"sleep\" : \"start\""))
    XCTAssertEqual(try DataTransfer.decodeAny(data).records.first?.sleep, .start)
}
```

- [ ] **Step 7: 跑測試確認通過**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 63 tests passed（50 + 12 + 1）

- [ ] **Step 8: Commit**

```bash
git add BabyMonster/Models BabyMonster/Logic/Sleep.swift BabyMonsterTests/SleepTests.swift BabyMonsterTests/DataTransferV2Tests.swift
git commit -m "Track sleep as start/wake events and total it per day"
```

---

### Task 3: 當日備註

**Files:**
- Modify: `BabyMonster/Logic/DailyStats.swift`
- Modify: `BabyMonsterTests/DailyStatsTests.swift`

**Interfaces:**
- Consumes: Task 1 的 `RecordData`
- Produces: `struct DayNote: Identifiable, Equatable { let id: UUID; let timestamp: Date; let note: String }`；`DailyStats.notes(for:records:calendar:) -> [DayNote]`

- [ ] **Step 1: 寫失敗的測試**

在 `BabyMonsterTests/DailyStatsTests.swift` 的 class 內加（注意既有的 `rec` helper 沒有 note 參數，這裡另寫一個）：

```swift
func recWithNote(_ date: Date, _ note: String?) -> RecordData {
    RecordData(id: UUID(), timestamp: date, feedAmount: nil, stoolColor: nil,
               stoolAmount: nil, stoolShape: nil, hasUrine: false,
               temperature: nil, weight: nil, note: note)
}

func testNotesOnlyForSelectedDaySortedEarliestFirst() {
    let morning = recWithNote(makeDate(2026, 7, 15, 8), "早上精神很好")
    let evening = recWithNote(makeDate(2026, 7, 15, 18), "晚上有點鬧")
    let records = [evening, morning,
                   recWithNote(makeDate(2026, 7, 15, 12), nil),
                   recWithNote(makeDate(2026, 7, 14, 23), "前一天"),
                   recWithNote(makeDate(2026, 7, 16, 0), "隔天")]
    let notes = DailyStats.notes(for: makeDate(2026, 7, 15), records: records, calendar: cal)
    XCTAssertEqual(notes.map(\.note), ["早上精神很好", "晚上有點鬧"])
    XCTAssertEqual(notes.map(\.id), [morning.id, evening.id])
}

func testEmptyNoteIsNotCounted() {
    let records = [recWithNote(makeDate(2026, 7, 15, 8), "")]
    XCTAssertTrue(DailyStats.notes(for: makeDate(2026, 7, 15), records: records, calendar: cal).isEmpty)
}

func testNoNotesReturnsEmpty() {
    let records = [recWithNote(makeDate(2026, 7, 15, 8), nil)]
    XCTAssertTrue(DailyStats.notes(for: makeDate(2026, 7, 15), records: records, calendar: cal).isEmpty)
}
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 編譯失敗，`type 'DailyStats' has no member 'notes'`

- [ ] **Step 3: 實作**

在 `BabyMonster/Logic/DailyStats.swift` 的 `DailySummary` 之後加型別，並在 `enum DailyStats` 內加方法：

```swift
struct DayNote: Identifiable, Equatable {
    let id: UUID
    let timestamp: Date
    let note: String
}
```

```swift
    /// 當天有寫備註的記錄，依時間由早到晚，方便回頭讀完整天發生的事。
    static func notes(for date: Date, records: [RecordData],
                      calendar: Calendar = .current) -> [DayNote] {
        records
            .filter { calendar.isDate($0.timestamp, inSameDayAs: date) }
            .compactMap { r in
                guard let n = r.note, !n.isEmpty else { return nil }
                return DayNote(id: r.id, timestamp: r.timestamp, note: n)
            }
            .sorted { $0.timestamp < $1.timestamp }
    }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 66 tests passed

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Logic/DailyStats.swift BabyMonsterTests/DailyStatsTests.swift
git commit -m "Collect the day's notes for the stats screen"
```

---

### Task 4: 疫苗時程資料與推算

整份時程是靜態資料。公費部分來自疾管署官方 PDF（已由網頁版核對過欄位對齊），自費部分來自使用者提供的 SIMBA 圖表；兩份的公費欄位一致。**這份資料是健康資訊，照抄下方內容，不要自行增刪或「補齊」看起來缺漏的項目。**

**Files:**
- Create: `BabyMonster/Logic/Vaccines.swift`
- Create: `BabyMonsterTests/VaccineTests.swift`

**Interfaces:**
- Consumes: 無
- Produces: `enum Funding: String { case publicFunded, selfPaid }`（`displayName` 公費/自費）；`struct VaccineDose`；`struct Vaccine: Identifiable`；`struct Milestone: Identifiable`；`Vaccines.all: [Vaccine]`；`Vaccines.milestones() -> [Milestone]`；`Vaccines.next(birthDate:asOf:calendar:) -> Milestone?`；`Vaccines.doseDate(birthDate:ageMonths:calendar:) -> Date`；`Vaccines.ageLabel(_:) -> String`；`Vaccines.sourceNotePublic`、`Vaccines.sourceNoteSelf`

- [ ] **Step 1: 寫失敗的測試**

Create `BabyMonsterTests/VaccineTests.swift`：

```swift
import XCTest
@testable import BabyMonster

final class VaccineTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d))!
    }

    /// 每劑寫成「月齡:給付別」，一眼對照時程表。
    func plan(_ id: String) -> [String] {
        Vaccines.all.first { $0.id == id }!.doses.map { "\($0.ageMonths):\($0.funding.rawValue)" }
    }

    func testPublicScheduleMatchesCDC() {
        XCTAssertEqual(plan("hepb"), ["0:public", "1:public", "6:public"])
        XCTAssertEqual(plan("bcg"), ["5:public"])
        XCTAssertEqual(plan("dtap-hib-ipv"), ["2:public", "4:public", "6:public", "18:public"])
        XCTAssertEqual(plan("pcv13"), ["2:public", "4:public", "12:public"])
        XCTAssertEqual(plan("mmr"), ["12:public", "60:public"])
        XCTAssertEqual(plan("je"), ["15:public", "27:public"])
        XCTAssertEqual(plan("hepa"), ["18:public", "27:public"])
        XCTAssertEqual(plan("dtap-ipv"), ["60:public"])
        XCTAssertEqual(plan("flu"), ["6:public", "7:public"])
    }

    func testSelfPaidScheduleMatchesChart() {
        XCTAssertEqual(plan("hbig"), ["0:self"])
        XCTAssertEqual(plan("rotavirus"), ["2:self", "4:self", "6:self"])
        XCTAssertEqual(plan("meningococcal"), ["2:self"])
        XCTAssertEqual(plan("ev71"), ["2:self"])
        XCTAssertEqual(plan("dtap-hib-ipv-hepb"), ["6:self", "18:self"])
    }

    func testVaricellaIsPublicThenSelfPaid() {
        XCTAssertEqual(plan("varicella"), ["12:public", "60:self"])
    }

    func testEveryVaccineHasDescriptionAndUniqueId() {
        for v in Vaccines.all { XCTAssertGreaterThan(v.description.count, 20, v.id) }
        XCTAssertEqual(Set(Vaccines.all.map(\.id)).count, Vaccines.all.count)
    }

    func testAgeLabels() {
        XCTAssertEqual(Vaccines.ageLabel(0), "出生 24 小時內")
        XCTAssertEqual(Vaccines.ageLabel(2), "滿 2 個月")
        XCTAssertEqual(Vaccines.ageLabel(12), "滿 1 歲")
        XCTAssertEqual(Vaccines.ageLabel(15), "滿 1 歲 3 個月")
        XCTAssertEqual(Vaccines.ageLabel(27), "滿 2 歲 3 個月")
        XCTAssertEqual(Vaccines.ageLabel(60), "滿 5 歲至入國小前")
    }

    func testMilestonesAreGroupedAndSorted() {
        XCTAssertEqual(Vaccines.milestones().map(\.ageMonths),
                       [0, 1, 2, 4, 5, 6, 7, 12, 15, 18, 27, 60])
    }

    func testPublicDosesSortBeforeSelfPaidInAMilestone() {
        let two = Vaccines.milestones().first { $0.ageMonths == 2 }!
        XCTAssertEqual(two.doses.map { "\($0.vaccine.id):\($0.dose.funding.rawValue)" },
                       ["dtap-hib-ipv:public", "pcv13:public",
                        "rotavirus:self", "meningococcal:self", "ev71:self"])
    }

    func testOneYearCarriesTheIntervalNote() {
        let ms = Vaccines.milestones()
        XCTAssertEqual(ms.first { $0.ageMonths == 12 }?.note,
                       "水痘第一劑與 13 價結合型肺炎鏈球菌第三劑需間隔兩週")
        XCTAssertNil(ms.first { $0.ageMonths == 2 }?.note)
    }

    func testDoseDateAddsMonthsToBirthDate() {
        let birth = day(2026, 7, 22)
        XCTAssertEqual(Vaccines.doseDate(birthDate: birth, ageMonths: 0, calendar: cal), day(2026, 7, 22))
        XCTAssertEqual(Vaccines.doseDate(birthDate: birth, ageMonths: 2, calendar: cal), day(2026, 9, 22))
        XCTAssertEqual(Vaccines.doseDate(birthDate: birth, ageMonths: 18, calendar: cal), day(2028, 1, 22))
    }

    func testNextReturnsNearestFutureMilestone() {
        let birth = day(2026, 7, 22)
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: day(2026, 8, 1), calendar: cal)?.ageMonths, 1)
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: day(2026, 9, 23), calendar: cal)?.ageMonths, 4)
    }

    func testMilestoneOnTheDayIsNotUpcoming() {
        let birth = day(2026, 7, 22)
        let onTheDay = Vaccines.doseDate(birthDate: birth, ageMonths: 2, calendar: cal)
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: onTheDay, calendar: cal)?.ageMonths, 4)
    }

    func testReturnsNilWhenEverythingHasPassed() {
        XCTAssertNil(Vaccines.next(birthDate: day(2026, 7, 22), asOf: day(2040, 1, 1), calendar: cal))
    }
}
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 編譯失敗，`cannot find 'Vaccines' in scope`

- [ ] **Step 3: 實作資料與推算**

Create `BabyMonster/Logic/Vaccines.swift`：

```swift
import Foundation

/// 兒童預防接種時程。
///
/// 公費：衛生福利部疾病管制署「現行兒童預防接種時程表（兒童常規疫苗）」11401 版（114 年 1 月）
///       https://www.cdc.gov.tw/Category/Page/TxRW-x3WzvPhvEtxM628GA
/// 自費：SIMBA「新生兒疫苗接種時程表（公費＋自費）」2026.03 版
///       https://shop.simba.com.tw/Article/Detail/104741
/// 兩份資料的公費欄位互相核對過，月齡與劑次一致。
///
/// 公費與自費掛在「劑次」而不是「疫苗」上：水痘第一劑公費、第二劑自費。
/// 時程會不定期調整，更新時請一併更新 sourceNotePublic / sourceNoteSelf。
enum Funding: String, Codable {
    case publicFunded = "public"
    case selfPaid = "self"

    var displayName: String {
        switch self {
        case .publicFunded: return "公費"
        case .selfPaid: return "自費"
        }
    }
}

struct VaccineDose: Identifiable, Equatable {
    let label: String       // 第一劑 / 一劑
    let ageMonths: Int      // 0 代表出生 24 小時內
    let funding: Funding
    var id: String { "\(label)-\(ageMonths)" }
}

struct Vaccine: Identifiable, Equatable {
    let id: String
    let name: String
    let en: String
    let description: String
    let doses: [VaccineDose]
    var recurring: String? = nil
    var note: String? = nil
}

struct ScheduledDose: Identifiable, Equatable {
    let vaccine: Vaccine
    let dose: VaccineDose
    var id: String { "\(vaccine.id)-\(dose.id)" }
}

struct Milestone: Identifiable, Equatable {
    let ageMonths: Int
    let doses: [ScheduledDose]
    var note: String? = nil
    var id: Int { ageMonths }
}

enum Vaccines {
    static let sourceNotePublic = "疾管署 11401 版（114 年 1 月）"
    static let sourceNoteSelf = "SIMBA 新生兒疫苗接種時程表 2026.03 版"

    /// 滿 5 歲至入國小前，時程表最後一格。
    private static let preschool = 60

    private static func pub(_ label: String, _ m: Int) -> VaccineDose {
        VaccineDose(label: label, ageMonths: m, funding: .publicFunded)
    }
    private static func slf(_ label: String, _ m: Int) -> VaccineDose {
        VaccineDose(label: label, ageMonths: m, funding: .selfPaid)
    }

    /// 同一次回診要打的疫苗彼此需要間隔時，註記在該月齡上。
    private static let milestoneNotes: [Int: String] = [
        12: "水痘第一劑與 13 價結合型肺炎鏈球菌第三劑需間隔兩週"
    ]

    static let all: [Vaccine] = [
        Vaccine(id: "hepb", name: "B型肝炎疫苗", en: "Hepatitis B",
                description: "預防B型肝炎病毒感染。台灣曾是B肝高盛行地區，新生兒按時接種能大幅降低變成帶原者的機會。帶原者成年後發生肝硬化、肝癌的風險明顯較高，所以第一劑安排在出生24小時內。",
                doses: [pub("第一劑", 0), pub("第二劑", 1), pub("第三劑", 6)]),

        Vaccine(id: "hbig", name: "B型肝炎免疫球蛋白", en: "HBIG",
                description: "這不是疫苗，而是現成的抗體。母親若是B型肝炎帶原者，寶寶出生24小時內施打可以立刻提供保護，再搭配B肝疫苗建立自己的長期免疫力。",
                doses: [slf("第一劑", 0)],
                note: "母親為B型肝炎表面抗原陽性之新生兒可公費施打"),

        Vaccine(id: "dtap-hib-ipv", name: "五合一疫苗", en: "DTaP-Hib-IPV",
                description: "一針同時預防白喉、破傷風、非細胞性百日咳、b型嗜血桿菌與小兒麻痺五種疾病。百日咳對未滿6個月的嬰兒特別危險，可能引起嚴重咳嗽甚至呼吸困難，按時接種很重要。",
                doses: [pub("第一劑", 2), pub("第二劑", 4), pub("第三劑", 6), pub("第四劑", 18)],
                note: "五合一與六合一可擇一施打"),

        Vaccine(id: "dtap-hib-ipv-hepb", name: "六合一疫苗", en: "DTaP-Hib-IPV-HepB",
                description: "在五合一的基礎上再加入B型肝炎，一針預防六種疾病。可以和五合一擇一組合施打，好處是減少寶寶挨針的次數。",
                doses: [slf("第一劑", 6), slf("第二劑", 18)],
                note: "五合一與六合一可擇一施打"),

        Vaccine(id: "pcv13", name: "13價結合型肺炎鏈球菌疫苗", en: "PCV13",
                description: "預防肺炎鏈球菌引起的侵襲性感染，包括腦膜炎、菌血症與肺炎。兩歲以下幼兒免疫力尚未成熟，是重症的高危險群。",
                doses: [pub("第一劑", 2), pub("第二劑", 4), pub("第三劑", 12)]),

        Vaccine(id: "rotavirus", name: "輪狀病毒疫苗", en: "Rotavirus",
                description: "口服疫苗，預防輪狀病毒引起的嚴重腹瀉與嘔吐。輪狀病毒是嬰幼兒因腹瀉住院最常見的原因，脫水對小寶寶相當危險。市面上有2劑型與3劑型兩種，無優劣之分。",
                doses: [slf("第一劑", 2), slf("第二劑", 4), slf("第三劑", 6)],
                note: "2劑型與3劑型不同廠牌不可混打；部分縣市有補助"),

        Vaccine(id: "meningococcal", name: "流行性腦脊髓膜炎疫苗", en: "Meningococcal",
                description: "預防腦膜炎雙球菌感染。這種細菌可能引起猛爆性敗血症或腦膜炎，病程進展非常快，短時間內就可能危及生命。",
                doses: [slf("第一劑", 2)],
                note: "2個月至成人皆可施打，時程依年紀不同，建議諮詢小兒科醫師"),

        Vaccine(id: "ev71", name: "腸病毒71型疫苗", en: "Enterovirus 71",
                description: "預防腸病毒71型。這一型腸病毒最容易引起重症，可能侵犯腦幹造成神經系統併發症。滿2個月起就可以接種。",
                doses: [slf("第一劑", 2)],
                note: "視廠牌施打 2–3 劑"),

        Vaccine(id: "bcg", name: "卡介苗", en: "BCG",
                description: "預防結核病，特別是嬰幼兒容易發生的結核性腦膜炎與粟粒性結核這類重症。接種部位會經歷紅腫、化膿再結痂的過程，最後留下小疤痕，這是正常反應。",
                doses: [pub("一劑", 5)],
                note: "建議接種時間為出生滿 5–8 個月，施打前建議提前預約"),

        Vaccine(id: "flu", name: "流感疫苗", en: "Influenza",
                description: "預防季節性流感。因為每年流行的病毒株會改變，保護力也會隨時間下降，所以需要每年接種。滿6個月就可以開始打。",
                doses: [pub("第一劑", 6), pub("第二劑", 7)],
                recurring: "之後每年十月起接種一劑",
                note: "未滿9歲初次接種，需隔四週接種第二劑"),

        Vaccine(id: "mmr", name: "麻疹腮腺炎德國麻疹混合疫苗", en: "MMR",
                description: "一針預防麻疹、腮腺炎與德國麻疹。麻疹傳染力極強，可能併發肺炎或腦炎；德國麻疹若由孕婦感染，還可能造成胎兒先天缺陷。",
                doses: [pub("第一劑", 12), pub("第二劑", preschool)]),

        Vaccine(id: "varicella", name: "水痘疫苗", en: "Varicella",
                description: "預防水痘。水痘傳染力很強，多數孩子症狀輕微，但可能併發皮膚細菌感染、肺炎或腦炎。接種後即使仍感染，症狀通常也會輕很多。",
                doses: [pub("第一劑", 12), slf("第二劑", preschool)]),

        Vaccine(id: "je", name: "活性減毒嵌合型日本腦炎疫苗", en: "Japanese encephalitis",
                description: "預防日本腦炎，一種經由三斑家蚊叮咬傳播的病毒性腦炎。發病後可能留下長期的神經系統後遺症，而且沒有特效藥可以治療，接種疫苗是主要的預防方式。",
                doses: [pub("第一劑", 15), pub("第二劑", 27)],
                note: "兩劑間隔 12 個月"),

        Vaccine(id: "hepa", name: "A型肝炎疫苗", en: "Hepatitis A",
                description: "預防經由飲食傳染的A型肝炎。幼兒感染後常常沒有明顯症狀，卻可能把病毒傳染給家裡的大人，而成人發病的症狀通常嚴重得多。",
                doses: [pub("第一劑", 18), pub("第二劑", 27)],
                note: "兩劑需間隔六個月；公費對象為民國 106 年 1 月 1 日（含）以後出生的幼兒"),

        Vaccine(id: "dtap-ipv", name: "四合一疫苗", en: "DTaP-IPV",
                description: "學齡前的加強劑，再次提升白喉、破傷風、百日咳與小兒麻痺的保護力。銜接即將進入小學的團體生活，避免保護力在學齡期下降。",
                doses: [pub("第一劑", preschool)]),
    ]

    static func ageLabel(_ ageMonths: Int) -> String {
        if ageMonths == 0 { return "出生 24 小時內" }
        if ageMonths >= preschool { return "滿 5 歲至入國小前" }
        if ageMonths >= 12 && ageMonths % 12 == 0 { return "滿 \(ageMonths / 12) 歲" }
        if ageMonths > 12 { return "滿 \(ageMonths / 12) 歲 \(ageMonths % 12) 個月" }
        return "滿 \(ageMonths) 個月"
    }

    /// 出生日往後推 N 個月的日期。
    static func doseDate(birthDate: Date, ageMonths: Int, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .month, value: ageMonths, to: birthDate) ?? birthDate
    }

    /// 所有疫苗依接種月齡分組，由小到大；組內公費排在自費前面，其餘維持疫苗定義順序。
    static func milestones(vaccines: [Vaccine] = all) -> [Milestone] {
        var byAge: [Int: [ScheduledDose]] = [:]
        for v in vaccines {
            for d in v.doses {
                byAge[d.ageMonths, default: []].append(ScheduledDose(vaccine: v, dose: d))
            }
        }
        return byAge.keys.sorted().map { age in
            let doses = byAge[age]!.enumerated()
                .sorted { a, b in
                    let ap = a.element.dose.funding == .publicFunded ? 0 : 1
                    let bp = b.element.dose.funding == .publicFunded ? 0 : 1
                    return ap == bp ? a.offset < b.offset : ap < bp
                }
                .map(\.element)
            return Milestone(ageMonths: age, doses: doses, note: milestoneNotes[age])
        }
    }

    /// 最接近、且還沒到的接種時間；全部都過了回傳 nil。
    static func next(birthDate: Date, asOf now: Date, calendar: Calendar = .current,
                     vaccines: [Vaccine] = all) -> Milestone? {
        milestones(vaccines: vaccines).first {
            doseDate(birthDate: birthDate, ageMonths: $0.ageMonths, calendar: calendar) > now
        }
    }
}
```

> `milestones()` 用 `enumerated()` 保留同給付別內的原始順序，因為 Swift 的 `sorted` 不保證穩定。

- [ ] **Step 4: 跑測試確認通過**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 78 tests passed（66 + 12）

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Logic/Vaccines.swift BabyMonsterTests/VaccineTests.swift
git commit -m "Add the childhood vaccination schedule and milestone lookup"
```

---

### Task 5: 記錄表單加入小便量與睡眠

**Files:**
- Modify: `BabyMonster/Views/RecordEntryForm.swift`

**Interfaces:**
- Consumes: Task 1 的 `Amount`、`RecordData.urineAmount`；Task 2 的 `SleepEvent`、`RecordData.sleep`
- Produces: 無（純畫面）

- [ ] **Step 1: 加 state 與 init**

在 `@State private var hasUrine = false` 之後加：

```swift
    @State private var urineAmount: Amount? = nil
    @State private var sleep: SleepEvent? = nil
```

在 init 內 `_hasUrine = ...` 之後加：

```swift
        _urineAmount = State(initialValue: initial?.urineAmount)
        _sleep = State(initialValue: initial?.sleep)
```

- [ ] **Step 2: 改小便區塊、加睡眠區塊**

把 `Section("小便") { Toggle("有小便", isOn: $hasUrine) }` 換成：

```swift
                Section("小便") {
                    Toggle("有小便", isOn: $hasUrine)
                    if hasUrine {
                        Picker("量", selection: $urineAmount) {
                            Text("未選").tag(Amount?.none)
                            ForEach(Amount.allCases) { Text($0.displayName).tag(Amount?.some($0)) }
                        }
                    }
                }

                Section("睡眠") {
                    Picker("這筆記錄", selection: $sleep) {
                        Text("不是睡眠記錄").tag(SleepEvent?.none)
                        ForEach(SleepEvent.allCases) { Text($0.displayName).tag(SleepEvent?.some($0)) }
                    }
                    Text("放下去睡時記一筆入睡，醒來時記一筆起床，統計頁會自動算出當天睡了多久。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
```

- [ ] **Step 3: 存檔時帶上新欄位**

`save()` 內，`data.babyId = existingBabyId` 之前加：

```swift
        data.urineAmount = hasUrine ? urineAmount : nil
        data.sleep = sleep
```

同時把 `RecordData(...)` 的 `hasUrine: hasUrine,` 保持原樣即可（`urineAmount` 走上面的指派，避免 memberwise init 參數順序問題）。

- [ ] **Step 4: 建置並在模擬器手動驗證**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 78 tests passed、無編譯錯誤

接著開模擬器確認：關閉「有小便」時量的 Picker 消失；開啟後選「中」再存檔，重新開啟該筆記錄時「中」仍在；睡眠選「入睡」存檔後重開也還在。

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Views/RecordEntryForm.swift
git commit -m "Add urine amount and sleep event to the record form"
```

---

### Task 6: 記錄頁可看指定日期、顯示新標籤

**Files:**
- Modify: `BabyMonster/Views/RecordView.swift`

**Interfaces:**
- Consumes: Task 1、2 的欄位
- Produces: 無（純畫面）

- [ ] **Step 1: 加日期狀態，把 `today` 換成 `dayRecords`**

在 `@State private var editing: RecordEntity?` 之後加：

```swift
    @State private var viewDate = Date()
```

把 `private var today: [RecordEntity]` 整段換成：

```swift
    private var dayRecords: [RecordEntity] {
        records.filter {
            $0.babyId == currentBaby?.id
                && Calendar.current.isDate($0.timestamp, inSameDayAs: viewDate)
        }
    }

    private var isViewingToday: Bool { Calendar.current.isDateInToday(viewDate) }
```

- [ ] **Step 2: 加日期選擇器、改 Section 標題與資料來源**

把 `Section("今日記錄（\(today.count) 筆）")` 整段換成：

```swift
                Section { DatePicker("日期", selection: $viewDate, displayedComponents: .date) }

                Section(isViewingToday
                        ? "今日記錄（\(dayRecords.count) 筆）"
                        : "\(viewDate.formatted(.dateTime.month().day())) 記錄（\(dayRecords.count) 筆）") {
                    if dayRecords.isEmpty {
                        Text(isViewingToday ? "今天還沒有記錄。" : "這天沒有記錄。")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(dayRecords) { entity in
                        Button { editing = entity } label: { RecordRow(data: entity.data) }
                            .buttonStyle(.plain)
                    }
                    .onDelete { indexSet in
                        for i in indexSet { context.delete(dayRecords[i]) }
                    }
                }
```

- [ ] **Step 3: 新增記錄時預設用選定日期**

把 `.sheet(isPresented: $showingForm)` 整段換成（補登前幾天時，表單時間預設落在那一天）：

```swift
            .sheet(isPresented: $showingForm) {
                RecordEntryForm(defaultDate: defaultFormDate) { data in
                    var d = data
                    d.babyId = ensureCurrentBaby().id
                    context.insert(RecordEntity(data: d))
                }
            }
```

並在 `ensureCurrentBaby()` 之前加：

```swift
    /// 看今天就用現在時刻；看往前幾天則落在那天的中午，方便再調時間。
    private var defaultFormDate: Date {
        isViewingToday ? Date()
            : Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: viewDate) ?? viewDate
    }
```

- [ ] **Step 4: RecordEntryForm 支援 defaultDate**

`BabyMonster/Views/RecordEntryForm.swift` 的 init 改為：

```swift
    init(initial: RecordData? = nil, defaultDate: Date = Date(),
         onSave: @escaping (RecordData) -> Void) {
        self.onSave = onSave
        _timestamp = State(initialValue: initial?.timestamp ?? defaultDate)
```

（其餘各行不動。`.sheet(item: $editing)` 那邊不傳 `defaultDate`，用預設值即可。）

- [ ] **Step 5: RecordRow 顯示小便量與睡眠**

把 `RecordRow` 的 `if data.hasUrine { ... }` 那行換成，並在體重之後補睡眠：

```swift
                if data.hasUrine {
                    Label(data.urineAmount.map { "小便・\($0.displayName)" } ?? "小便",
                          systemImage: "toilet.fill")
                }
```

```swift
                if let w = data.weight { Label("\(Int(w))g", systemImage: "scalemass") }
                if let s = data.sleep { Label(s.displayName, systemImage: s.systemImage) }
```

- [ ] **Step 6: 建置並在模擬器手動驗證**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 78 tests passed

模擬器確認：日期選到前幾天時清單只顯示那天的記錄、標題變成「8/5 記錄」；那天沒有記錄時顯示「這天沒有記錄。」；此時按 ＋ 新增，表單時間預設落在那一天；小便量與睡眠標籤有出現。

- [ ] **Step 7: Commit**

```bash
git add BabyMonster/Views/RecordView.swift BabyMonster/Views/RecordEntryForm.swift
git commit -m "Let the record list show any picked day and surface the new fields"
```

---

### Task 7: 統計頁加睡眠總時數與當日備註

**Files:**
- Modify: `BabyMonster/Views/DailyStatsView.swift`

**Interfaces:**
- Consumes: Task 2 的 `Sleep.dailyMinutes`；Task 3 的 `DailyStats.notes`、`DayNote`
- Produces: 無（純畫面）

- [ ] **Step 1: 算出睡眠與備註**

把 `private var summary: DailySummary` 整段換成：

```swift
    private var babyRecords: [RecordData] {
        records.filter { $0.babyId == currentBaby?.id }.map { $0.data }
    }

    private var summary: DailySummary {
        DailyStats.summary(for: date, records: babyRecords)
    }

    private var sleepMinutes: Int {
        Sleep.dailyMinutes(for: date, records: babyRecords)
    }

    private var notes: [DayNote] {
        DailyStats.notes(for: date, records: babyRecords)
    }

    /// 90 分 →「1 小時 30 分」；未滿一小時只顯示分鐘。
    private func sleepText(_ minutes: Int) -> String {
        if minutes == 0 { return "—" }
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m) 分" }
        return m == 0 ? "\(h) 小時" : "\(h) 小時 \(m) 分"
    }
```

- [ ] **Step 2: 加睡眠列與備註區塊**

在 `statRow("平均體重", ...)` 之後（仍在「當日統計」Section 內）加：

```swift
                    statRow("睡眠時間", sleepText(sleepMinutes))
```

在該 Section 之後、`}` 收掉 List 之前加：

```swift
                Section("當日備註") {
                    if notes.isEmpty {
                        Text("這天沒有寫備註。").foregroundStyle(.secondary)
                    }
                    ForEach(notes) { n in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(n.timestamp, format: .dateTime.hour().minute())
                                .font(.caption).foregroundStyle(.secondary)
                            Text(n.note)
                        }
                    }
                }
```

- [ ] **Step 3: 建置並在模擬器手動驗證**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 78 tests passed

模擬器確認：記一筆 13:00 入睡、14:30 起床，統計頁顯示「1 小時 30 分」；再記 20:00 入睡、隔天 06:00 起床，當天變成「5 小時 30 分」、隔天顯示「6 小時」；只記入睡沒記起床時不計入。有寫備註的記錄會依時間由早到晚列在「當日備註」。

- [ ] **Step 4: Commit**

```bash
git add BabyMonster/Views/DailyStatsView.swift
git commit -m "Show daily sleep total and the day's notes in stats"
```

---

### Task 8: 疫苗分頁

**Files:**
- Create: `BabyMonster/Views/VaccineView.swift`
- Modify: `BabyMonster/RootTabView.swift`

**Interfaces:**
- Consumes: Task 4 的 `Vaccines`、`Milestone`、`ScheduledDose`、`Vaccine`、`Funding`
- Produces: 無（純畫面）

- [ ] **Step 1: 建立 VaccineView**

Create `BabyMonster/Views/VaccineView.swift`：

```swift
import SwiftUI
import SwiftData

struct VaccineView: View {
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var selected: Vaccine?

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    private var upcoming: Milestone? {
        guard let baby = currentBaby else { return nil }
        return Vaccines.next(birthDate: baby.birthDate, asOf: Date())
    }

    var body: some View {
        NavigationStack {
            List {
                upcomingSection
                scheduleSection
                sourceSection
            }
            .navigationTitle("疫苗")
            .toolbar { ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) } }
            .sheet(item: $selected) { vaccine in VaccineDetailSheet(vaccine: vaccine) }
        }
    }

    @ViewBuilder
    private var upcomingSection: some View {
        Section("接下來要打的疫苗") {
            if currentBaby == nil {
                Text("尚未建立寶寶，請先到設定頁新增，才能依生日推算接種時間。")
                    .foregroundStyle(.secondary)
            } else if let m = upcoming, let baby = currentBaby {
                let date = Vaccines.doseDate(birthDate: baby.birthDate, ageMonths: m.ageMonths)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Vaccines.ageLabel(m.ageMonths)).font(.headline)
                    Text("\(date, format: .dateTime.year().month().day())（還有 \(daysUntil(date)) 天）")
                        .font(.caption).foregroundStyle(.secondary)
                }
                fundingRows(m.doses)
                if let note = m.note { noteText(note) }
            } else {
                Text("時程表上的疫苗都已經過了接種年齡。").foregroundStyle(.secondary)
            }
        }
    }

    private var scheduleSection: some View {
        Section("接種時程表") {
            Text("點疫苗名稱可以看它預防什麼。").font(.footnote).foregroundStyle(.secondary)
            ForEach(Vaccines.milestones()) { m in
                VStack(alignment: .leading, spacing: 6) {
                    Text(Vaccines.ageLabel(m.ageMonths))
                        .font(.subheadline.bold()).foregroundStyle(.tint)
                    ForEach(m.doses) { d in vaccineButton(d) }
                    if let note = m.note { noteText(note) }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var sourceSection: some View {
        Section("資料來源") {
            Text("公費時程整理自衛生福利部疾病管制署「現行兒童預防接種時程表（兒童常規疫苗）」\(Vaccines.sourceNotePublic)；自費時程整理自 \(Vaccines.sourceNoteSelf)。")
                .font(.footnote).foregroundStyle(.secondary)
            Text("自費疫苗的劑數與月齡會依廠牌、診所而不同，時程也會不定期調整。實際接種時間與項目請以兒童健康手冊及醫師評估為準。")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func fundingRows(_ doses: [ScheduledDose]) -> some View {
        ForEach([Funding.publicFunded, Funding.selfPaid], id: \.rawValue) { funding in
            let group = doses.filter { $0.dose.funding == funding }
            VStack(alignment: .leading, spacing: 6) {
                Text(funding.displayName)
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(funding == .publicFunded ? Color.orange.opacity(0.18) : Color.pink.opacity(0.15))
                    .clipShape(Capsule())
                if group.isEmpty {
                    Text("這次沒有\(funding.displayName)疫苗。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(group) { d in vaccineButton(d) }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func vaccineButton(_ d: ScheduledDose) -> some View {
        Button { selected = d.vaccine } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.vaccine.name).font(.subheadline)
                    Text("\(d.dose.label)・\(d.dose.funding.displayName)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "info.circle").foregroundStyle(.tint)
            }
        }
        .buttonStyle(.plain)
    }

    private func noteText(_ note: String) -> some View {
        Text(note)
            .font(.footnote)
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func daysUntil(_ target: Date) -> Int {
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: Date()),
                                  to: cal.startOfDay(for: target)).day ?? 0
    }
}

struct VaccineDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let vaccine: Vaccine

    var body: some View {
        NavigationStack {
            List {
                Section { Text(vaccine.description) }
                Section("接種時程") {
                    ForEach(vaccine.doses) { d in
                        HStack {
                            Text(Vaccines.ageLabel(d.ageMonths))
                            Spacer()
                            Text("\(d.label)・\(d.funding.displayName)")
                                .foregroundStyle(.secondary)
                        }
                    }
                    if let r = vaccine.recurring {
                        Text(r).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if let note = vaccine.note {
                    Section("附註") { Text(note).font(.footnote) }
                }
            }
            .navigationTitle(vaccine.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("關閉") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
```

- [ ] **Step 2: 加分頁**

`BabyMonster/RootTabView.swift` 在趨勢與設定之間插入：

```swift
            VaccineView().tabItem { Label("疫苗", systemImage: "syringe") }
```

- [ ] **Step 3: 建置並在模擬器手動驗證**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 78 tests passed

模擬器確認：TabView 有 5 個分頁且標題沒被截斷；把寶寶生日設成 2025-09-01，「接下來要打的疫苗」顯示「滿 1 歲」與該日期、公費三項、間隔提醒；時程表 12 組由 0 到 60 個月；點任一疫苗名稱跳出說明 sheet，往下滑可關閉。

- [ ] **Step 4: Commit**

```bash
git add BabyMonster/Views/VaccineView.swift BabyMonster/RootTabView.swift
git commit -m "Add a vaccine tab with the schedule and what is due next"
```

---

### Task 9: 更新 PROGRESS.md 並收尾

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 跑完整測試**

Run: `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
Expected: 78 tests passed

- [ ] **Step 2: 記錄結果**

在 `PROGRESS.md` 的「目前狀態」新增一段，寫下：iOS 已追平網頁版（小便量、睡眠、當日備註、記錄頁日期切換、疫苗頁）、iOS 測試數由 47 增為 78、疫苗資料版本（疾管署 11401 版、SIMBA 2026.03 版）與「疾管署更新時需同步 `Vaccines.swift` 與 `web/src/logic/vaccines.ts` 兩處」。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "Record the iOS parity work in PROGRESS.md"
```

---

## 完成後仍存在的已知落差

這些網頁版也沒做，不是這次的缺漏，列出來避免下次重複討論：

- 6 個月與 1 歲 6 個月的「五合一 OR 六合一」是兩邊都列、各自標註可擇一，不是互斥選擇。
- 流感疫苗只在滿 6、7 個月提醒，不會每年提醒。
- 疫苗時程沒有「已完成」勾選，只推算下一個時間點。
- 疫苗資料寫死在程式碼裡，疾管署更新時要手動改兩個平台。
