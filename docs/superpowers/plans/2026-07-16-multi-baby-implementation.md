# Multi-Baby Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 BabyMonster 支援多寶寶記錄：全 App 單一「當前寶寶」切換、寶寶清單管理、v2 匯出/匯入（含 v1 相容與跨機名字對應合併）、舊資料自動遷移。

**Architecture:** 方案 A — `ProfileEntity` 加 `id`、`RecordEntity` 加 `babyId`（皆為輕量遷移安全的預設值/optional 欄位）。純邏輯層（DailyStats/TrendSeries/BabyAge）不動，視圖端先按當前寶寶過濾。新純邏輯：`CurrentBaby`（解析當前寶寶）、`LegacyMigration`（啟動歸屬）、`DataTransfer` v2（encodeV2/decodeAny/mergeBabies）。

**Tech Stack:** SwiftUI, SwiftData, XCTest（現有 27 測試必須全程保持綠燈）。

## Global Constraints

- 最低 iOS 17；bundle id `com.wsturkey6.BabyMonster`。
- **值型別新欄位一律放在既有欄位之後且有預設值**（`ProfileData.id: UUID = UUID()`、`RecordData.babyId: UUID? = nil` 置於最後），確保既有呼叫端與既有 27 個測試不需改動即可編譯。
- SwiftData 新欄位只允許「optional 或有預設值」（輕量遷移安全）；**不加** `@Attribute(.unique)` 到 ProfileEntity.id。
- 預設寶寶名 `BabyMonster`；自動建立時生日 = 當天（`Calendar.current.startOfDay(for: Date())`）。
- `@AppStorage("currentBabyId")` 存 UUID 字串；解析規則：存值對不中 → 第一個寶寶 → nil。
- 匯入合併規則：寶寶先按 id、再按名字完全相同對應（名字對中時重對映進來記錄的 babyId）、都沒中新建；記錄按 id 聯集去重、本機優先、timestamp 排序。
- 測試指令（固定）：
  `xcodebuild test -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO`
- 建置指令（UI 任務驗證）：同上把 `test` 換成 `build`。
- 每個 Task 結束 commit（訊息見各 Task）；只 stage 該任務的檔案，不用 `git add -A`。

---

### Task 1: 值型別與 Entity 加欄位

**Files:**
- Modify: `BabyMonster/Models/ProfileData.swift`
- Modify: `BabyMonster/Models/RecordData.swift`
- Modify: `BabyMonster/Models/ProfileEntity.swift`
- Modify: `BabyMonster/Models/RecordEntity.swift`
- Test: `BabyMonsterTests/ModelCodableTests.swift`（追加測試，不改既有）

**Interfaces:**
- Produces: `ProfileData { id: UUID; name; birthDate }`（decode 容忍缺 id → 自動補 UUID）；`RecordData` 尾端新增 `babyId: UUID? = nil`；`ProfileEntity.id: UUID`；`RecordEntity.babyId: UUID?`；兩 Entity 的 `data`/`init(data:)`/`apply(_:)` 對映新欄位。

- [ ] **Step 1: 追加失敗測試（附加到 ModelCodableTests.swift 檔尾 class 內）**

```swift
    func testProfileDataDecodeWithoutIdGetsGeneratedId() throws {
        let json = #"{"name":"Old","birthDate":"2024-05-20T00:00:00Z"}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let p = try decoder.decode(ProfileData.self, from: json)
        XCTAssertEqual(p.name, "Old")
        // id 自動產生，不會 throw
    }

    func testRecordDataBabyIdRoundTrip() throws {
        let bid = UUID()
        var rec = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: 1000),
                             feedAmount: 50, stoolColor: nil, stoolAmount: nil, stoolShape: nil,
                             hasUrine: false, temperature: nil, weight: nil, note: nil)
        rec.babyId = bid
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let decoded = try decoder.decode(RecordData.self, from: encoder.encode(rec))
        XCTAssertEqual(decoded.babyId, bid)
        XCTAssertEqual(decoded, rec)
    }

    func testRecordDataDecodeWithoutBabyIdIsNil() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","timestamp":"2026-01-01T00:00:00Z","hasUrine":false}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let r = try decoder.decode(RecordData.self, from: json)
        XCTAssertNil(r.babyId)
    }
```

- [ ] **Step 2: 跑測試確認 RED**

Run: 測試指令。Expected: 編譯錯誤（`rec.babyId` 不存在）。

- [ ] **Step 3: 改值型別**

`BabyMonster/Models/ProfileData.swift`（全檔取代）:
```swift
import Foundation

struct ProfileData: Codable, Equatable {
    var id: UUID
    var name: String
    var birthDate: Date

    init(id: UUID = UUID(), name: String, birthDate: Date) {
        self.id = id
        self.name = name
        self.birthDate = birthDate
    }

    private enum CodingKeys: String, CodingKey { case id, name, birthDate }

    /// v1 舊檔沒有 id → 解碼時自動補一個新 UUID。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decode(String.self, forKey: .name)
        birthDate = try c.decode(Date.self, forKey: .birthDate)
    }
}
```

`BabyMonster/Models/RecordData.swift`：在 `var note: String?` 之後、`var hasStool` 之前加一行（欄位置於最後，既有呼叫端不需改）：
```swift
    var babyId: UUID? = nil      // 所屬寶寶；nil = 遷移前舊資料
```

- [ ] **Step 4: 改 Entities**

`BabyMonster/Models/ProfileEntity.swift`（全檔取代）:
```swift
import Foundation
import SwiftData

@Model
final class ProfileEntity {
    var id: UUID = UUID()
    var name: String
    var birthDate: Date

    init(id: UUID = UUID(), name: String, birthDate: Date) {
        self.id = id
        self.name = name
        self.birthDate = birthDate
    }

    convenience init(data: ProfileData) {
        self.init(id: data.id, name: data.name, birthDate: data.birthDate)
    }

    var data: ProfileData { ProfileData(id: id, name: name, birthDate: birthDate) }
}
```

`BabyMonster/Models/RecordEntity.swift`：
1. 屬性區 `var note: String?` 後加 `var babyId: UUID?`
2. memberwise init 簽名尾端加 `, babyId: UUID? = nil`，init 內加 `self.babyId = babyId`
3. `convenience init(data:)` 尾端傳 `babyId: data.babyId`
4. `apply(_:)` 內加 `babyId = data.babyId`
5. `var data` 的建構尾端加 `babyId: babyId`（直接用 `RecordData(...)` 現有參數列，末尾補 `, babyId: babyId` — 注意 RecordData 的 memberwise 初始化含預設值，具名參數照宣告順序放最後即可）

- [ ] **Step 5: 跑測試確認 GREEN（含既有 27 測試全綠）**

Run: 測試指令。Expected: `** TEST SUCCEEDED **`，30 tests。

- [ ] **Step 6: Commit**

```bash
git add BabyMonster/Models BabyMonsterTests/ModelCodableTests.swift
git commit -m "Multi-baby 1/8: add ProfileData.id and RecordData.babyId with v1-tolerant decoding"
```

---

### Task 2: LegacyMigration（啟動歸屬）

**Files:**
- Create: `BabyMonster/Logic/LegacyMigration.swift`
- Test: `BabyMonsterTests/LegacyMigrationTests.swift`

**Interfaces:**
- Consumes: `ProfileEntity`, `RecordEntity`, `AppModelContainer.makeInMemory()`
- Produces: `enum LegacyMigration { @MainActor static func run(context: ModelContext) throws }`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/LegacyMigrationTests.swift`:
```swift
import XCTest
import SwiftData
@testable import BabyMonster

final class LegacyMigrationTests: XCTestCase {
    @MainActor
    func makeContext() throws -> ModelContext {
        try AppModelContainer.makeInMemory().mainContext
    }

    @MainActor
    func testAssignsOrphanRecordsToFirstProfile() throws {
        let ctx = try makeContext()
        let baby = ProfileEntity(name: "A", birthDate: Date(timeIntervalSince1970: 0))
        ctx.insert(baby)
        let rec = RecordEntity(id: UUID(), timestamp: Date(), feedAmount: 10, stoolColor: nil,
                               stoolAmountRaw: nil, stoolShapeRaw: nil, hasUrine: false,
                               temperature: nil, weight: nil, note: nil, babyId: nil)
        ctx.insert(rec)
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        XCTAssertEqual(rec.babyId, baby.id)
    }

    @MainActor
    func testCreatesDefaultBabyWhenNoneExists() throws {
        let ctx = try makeContext()
        let rec = RecordEntity(id: UUID(), timestamp: Date(), feedAmount: nil, stoolColor: 7,
                               stoolAmountRaw: nil, stoolShapeRaw: nil, hasUrine: false,
                               temperature: nil, weight: nil, note: nil, babyId: nil)
        ctx.insert(rec)
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        let profiles = try ctx.fetch(FetchDescriptor<ProfileEntity>())
        XCTAssertEqual(profiles.count, 1)
        XCTAssertEqual(profiles.first?.name, "BabyMonster")
        XCTAssertEqual(rec.babyId, profiles.first?.id)
    }

    @MainActor
    func testIdempotent() throws {
        let ctx = try makeContext()
        let baby = ProfileEntity(name: "A", birthDate: Date(timeIntervalSince1970: 0))
        ctx.insert(baby)
        let rec = RecordEntity(id: UUID(), timestamp: Date(), feedAmount: 10, stoolColor: nil,
                               stoolAmountRaw: nil, stoolShapeRaw: nil, hasUrine: false,
                               temperature: nil, weight: nil, note: nil, babyId: nil)
        ctx.insert(rec)
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        let firstAssign = rec.babyId
        try LegacyMigration.run(context: ctx)   // 再跑一次
        XCTAssertEqual(rec.babyId, firstAssign)
        XCTAssertEqual(try ctx.fetch(FetchDescriptor<ProfileEntity>()).count, 1)
    }

    @MainActor
    func testDeduplicatesProfileIds() throws {
        let ctx = try makeContext()
        let shared = UUID()
        ctx.insert(ProfileEntity(id: shared, name: "A", birthDate: Date(timeIntervalSince1970: 0)))
        ctx.insert(ProfileEntity(id: shared, name: "B", birthDate: Date(timeIntervalSince1970: 100)))
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        let ids = try ctx.fetch(FetchDescriptor<ProfileEntity>()).map { $0.id }
        XCTAssertEqual(Set(ids).count, 2)
    }
}
```

- [ ] **Step 2: 跑測試確認 RED**（編譯錯誤：`LegacyMigration` 未定義）

- [ ] **Step 3: 實作**

`BabyMonster/Logic/LegacyMigration.swift`:
```swift
import Foundation
import SwiftData

/// v1 → v2 一次性資料歸屬：把沒有 babyId 的舊記錄歸給第一個寶寶。冪等。
enum LegacyMigration {
    @MainActor
    static func run(context: ModelContext) throws {
        // 1. 寶寶 id 去重（防輕量遷移為既有多列填入相同預設值）
        let profiles = try context.fetch(
            FetchDescriptor<ProfileEntity>(sortBy: [SortDescriptor(\.birthDate)]))
        var seen = Set<UUID>()
        for p in profiles {
            if seen.contains(p.id) { p.id = UUID() }
            seen.insert(p.id)
        }

        // 2. 歸屬 nil-babyId 記錄
        let orphans = try context.fetch(FetchDescriptor<RecordEntity>())
            .filter { $0.babyId == nil }
        if orphans.isEmpty { try context.save(); return }

        let owner: ProfileEntity
        if let first = profiles.first {
            owner = first
        } else {
            owner = ProfileEntity(name: "BabyMonster",
                                  birthDate: Calendar.current.startOfDay(for: Date()))
            context.insert(owner)
        }
        for r in orphans { r.babyId = owner.id }
        try context.save()
    }
}
```

- [ ] **Step 4: 跑測試確認 GREEN**（34 tests）

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Logic/LegacyMigration.swift BabyMonsterTests/LegacyMigrationTests.swift
git commit -m "Multi-baby 2/8: legacy migration assigns orphan records to first baby"
```

---

### Task 3: CurrentBaby 解析（純函式）

**Files:**
- Create: `BabyMonster/Logic/CurrentBaby.swift`
- Test: `BabyMonsterTests/CurrentBabyTests.swift`

**Interfaces:**
- Produces: `enum CurrentBaby { static func resolve(storedId: UUID?, profileIds: [UUID]) -> UUID? }`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/CurrentBabyTests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class CurrentBabyTests: XCTestCase {
    func testStoredIdMatches() {
        let a = UUID(), b = UUID()
        XCTAssertEqual(CurrentBaby.resolve(storedId: b, profileIds: [a, b]), b)
    }
    func testStoredIdMissingFallsBackToFirst() {
        let a = UUID(), b = UUID()
        XCTAssertEqual(CurrentBaby.resolve(storedId: UUID(), profileIds: [a, b]), a)
    }
    func testNilStoredFallsBackToFirst() {
        let a = UUID()
        XCTAssertEqual(CurrentBaby.resolve(storedId: nil, profileIds: [a]), a)
    }
    func testEmptyProfilesReturnsNil() {
        XCTAssertNil(CurrentBaby.resolve(storedId: UUID(), profileIds: []))
    }
}
```

- [ ] **Step 2: 跑測試確認 RED**（`CurrentBaby` 未定義）

- [ ] **Step 3: 實作**

`BabyMonster/Logic/CurrentBaby.swift`:
```swift
import Foundation

/// 解析「當前寶寶」：存的 id 有效就用它，否則退回第一個寶寶；沒有寶寶回 nil。
enum CurrentBaby {
    static func resolve(storedId: UUID?, profileIds: [UUID]) -> UUID? {
        if let storedId, profileIds.contains(storedId) { return storedId }
        return profileIds.first
    }
}
```

- [ ] **Step 4: 跑測試確認 GREEN**（38 tests）

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Logic/CurrentBaby.swift BabyMonsterTests/CurrentBabyTests.swift
git commit -m "Multi-baby 3/8: current-baby resolution logic"
```

---

### Task 4: DataTransfer v2（encodeV2 / decodeAny / mergeBabies）

**Files:**
- Modify: `BabyMonster/Logic/DataTransfer.swift`
- Test: `BabyMonsterTests/DataTransferV2Tests.swift`（新檔；既有 DataTransferTests 不動）

**Interfaces:**
- Consumes: `ProfileData`（含 id、v1 容忍解碼）、`RecordData`（含 babyId）、既有 `BackupPayload`/`decode`/`mergeRecords`
- Produces:
  - `struct BackupPayloadV2: Codable, Equatable { var version: Int = 2; var profiles: [ProfileData]; var records: [RecordData] }`
  - `DataTransfer.encodeV2(_:) throws -> Data`
  - `DataTransfer.decodeAny(_:) throws -> BackupPayloadV2`（v2 → 失敗退 v1 轉換：v1 records 全綁 v1 profile 解碼後的 id）
  - `DataTransfer.mergeBabies(localProfiles:localRecords:incomingProfiles:incomingRecords:) -> (profiles: [ProfileData], records: [RecordData])`

- [ ] **Step 1: 撰寫失敗測試**

`BabyMonsterTests/DataTransferV2Tests.swift`:
```swift
import XCTest
@testable import BabyMonster

final class DataTransferV2Tests: XCTestCase {
    func rec(_ id: UUID, _ t: TimeInterval, baby: UUID?, feed: Double? = nil) -> RecordData {
        var r = RecordData(id: id, timestamp: Date(timeIntervalSince1970: t), feedAmount: feed,
                           stoolColor: nil, stoolAmount: nil, stoolShape: nil, hasUrine: false,
                           temperature: nil, weight: nil, note: nil)
        r.babyId = baby
        return r
    }

    func testV2RoundTrip() throws {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let payload = BackupPayloadV2(profiles: [baby],
                                      records: [rec(UUID(), 1000, baby: baby.id, feed: 100)])
        let decoded = try DataTransfer.decodeAny(DataTransfer.encodeV2(payload))
        XCTAssertEqual(decoded, payload)
    }

    func testDecodeV1FileConvertsToV2() throws {
        let v1Json = """
        {"profile":{"name":"Old","birthDate":"2024-05-20T00:00:00Z"},
         "records":[{"id":"00000000-0000-0000-0000-000000000001",
                     "timestamp":"2026-01-01T08:00:00Z","hasUrine":true}]}
        """.data(using: .utf8)!
        let v2 = try DataTransfer.decodeAny(v1Json)
        XCTAssertEqual(v2.profiles.count, 1)
        XCTAssertEqual(v2.profiles.first?.name, "Old")
        XCTAssertEqual(v2.records.count, 1)
        XCTAssertEqual(v2.records.first?.babyId, v2.profiles.first?.id) // 全綁該寶寶
    }

    func testMergeBabiesMatchById() {
        let baby = ProfileData(name: "同id", birthDate: Date(timeIntervalSince1970: 0))
        var incomingBaby = baby; incomingBaby.name = "改過名"     // 同 id、不同名 → 本機為準
        let result = DataTransfer.mergeBabies(
            localProfiles: [baby], localRecords: [],
            incomingProfiles: [incomingBaby], incomingRecords: [rec(UUID(), 1, baby: baby.id)])
        XCTAssertEqual(result.profiles.count, 1)
        XCTAssertEqual(result.profiles.first?.name, "同id")
        XCTAssertEqual(result.records.count, 1)
    }

    func testMergeBabiesMatchByNameRemapsBabyId() {
        let localBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let remoteBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 50)) // 不同 id 同名
        let r1 = rec(UUID(), 1000, baby: remoteBaby.id, feed: 60)
        let result = DataTransfer.mergeBabies(
            localProfiles: [localBaby], localRecords: [],
            incomingProfiles: [remoteBaby], incomingRecords: [r1])
        XCTAssertEqual(result.profiles.count, 1)                       // 不新增寶寶
        XCTAssertEqual(result.records.first?.babyId, localBaby.id)     // babyId 重對映
    }

    func testMergeBabiesNewBabyAppended() {
        let localBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let newBaby = ProfileData(name: "小美", birthDate: Date(timeIntervalSince1970: 99))
        let r1 = rec(UUID(), 1000, baby: newBaby.id)
        let result = DataTransfer.mergeBabies(
            localProfiles: [localBaby], localRecords: [],
            incomingProfiles: [newBaby], incomingRecords: [r1])
        XCTAssertEqual(result.profiles.count, 2)
        XCTAssertEqual(result.records.first?.babyId, newBaby.id)       // 不重對映
    }

    func testMergeBabiesRecordDedupLocalWins() {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let shared = UUID()
        let localRec = rec(shared, 1000, baby: baby.id, feed: 100)
        let incomingRec = rec(shared, 1000, baby: baby.id, feed: 999)
        let result = DataTransfer.mergeBabies(
            localProfiles: [baby], localRecords: [localRec],
            incomingProfiles: [baby], incomingRecords: [incomingRec])
        XCTAssertEqual(result.records.count, 1)
        XCTAssertEqual(result.records.first?.feedAmount, 100)
    }
}
```

- [ ] **Step 2: 跑測試確認 RED**（`BackupPayloadV2`/`encodeV2`/`decodeAny`/`mergeBabies` 未定義）

- [ ] **Step 3: 實作（附加到 DataTransfer.swift；既有 BackupPayload/encode/decode/mergeRecords 保留不動）**

```swift
// MARK: - v2（多寶寶）

struct BackupPayloadV2: Codable, Equatable {
    var version: Int = 2
    var profiles: [ProfileData]
    var records: [RecordData]
}

extension DataTransfer {
    static func encodeV2(_ payload: BackupPayloadV2) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(payload)
    }

    /// 先試 v2；失敗退回 v1 並轉換（v1 記錄全綁其 profile 的 id）。
    static func decodeAny(_ data: Data) throws -> BackupPayloadV2 {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let v2 = try? decoder.decode(BackupPayloadV2.self, from: data) { return v2 }
        let v1 = try decoder.decode(BackupPayload.self, from: data)
        let records = v1.records.map { r -> RecordData in
            var r = r; r.babyId = v1.profile.id; return r
        }
        return BackupPayloadV2(profiles: [v1.profile], records: records)
    }

    /// 寶寶合併：id 對中 → 本機為準；名字對中 → 重對映進來記錄的 babyId；都沒中 → 新增。
    /// 記錄再走 mergeRecords（id 聯集去重、本機優先、依 timestamp 排序）。
    static func mergeBabies(localProfiles: [ProfileData], localRecords: [RecordData],
                            incomingProfiles: [ProfileData], incomingRecords: [RecordData])
        -> (profiles: [ProfileData], records: [RecordData]) {
        var profiles = localProfiles
        var idRemap: [UUID: UUID] = [:]
        for p in incomingProfiles {
            if localProfiles.contains(where: { $0.id == p.id }) { continue }
            if let match = localProfiles.first(where: { $0.name == p.name }) {
                idRemap[p.id] = match.id
            } else {
                profiles.append(p)
            }
        }
        let remapped = incomingRecords.map { r -> RecordData in
            var r = r
            if let bid = r.babyId, let mapped = idRemap[bid] { r.babyId = mapped }
            return r
        }
        return (profiles, mergeRecords(local: localRecords, incoming: remapped))
    }
}
```

- [ ] **Step 4: 跑測試確認 GREEN**（44 tests）

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Logic/DataTransfer.swift BabyMonsterTests/DataTransferV2Tests.swift
git commit -m "Multi-baby 4/8: v2 payload, v1-compatible decodeAny, baby merge with name remap"
```

---

### Task 5: 寶寶切換器元件 + 記錄頁改版

**Files:**
- Create: `BabyMonster/Views/BabyPickerMenu.swift`
- Modify: `BabyMonster/Views/RecordView.swift`
- Modify: `BabyMonster/Views/RecordEntryForm.swift`

**Interfaces:**
- Consumes: `CurrentBaby.resolve`, `ProfileEntity`, `RecordEntity`
- Produces: `BabyPickerMenu`（導覽列切換器，讀寫 `@AppStorage("currentBabyId")`）；RecordView 過濾當前寶寶、新記錄綁 babyId、無寶寶自動建預設寶寶；RecordEntryForm 編輯時保留原 babyId。

- [ ] **Step 1: 切換器元件**

`BabyMonster/Views/BabyPickerMenu.swift`:
```swift
import SwiftUI
import SwiftData

/// 導覽列上的寶寶切換器；無寶寶時不顯示。
struct BabyPickerMenu: View {
    let profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""

    private var current: ProfileEntity? {
        let resolved = CurrentBaby.resolve(storedId: UUID(uuidString: currentBabyIdString),
                                           profileIds: profiles.map { $0.id })
        return profiles.first { $0.id == resolved }
    }

    var body: some View {
        if let current {
            Menu {
                ForEach(profiles, id: \.id) { p in
                    Button {
                        currentBabyIdString = p.id.uuidString
                    } label: {
                        if p.id == current.id {
                            Label(p.name, systemImage: "checkmark")
                        } else {
                            Text(p.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(current.name)
                    Image(systemName: "chevron.down").font(.caption2)
                }
                .font(.subheadline.weight(.medium))
            }
        }
    }
}
```

- [ ] **Step 2: RecordView 改版（全檔取代 struct RecordView；RecordRow 不動）**

```swift
struct RecordView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \RecordEntity.timestamp, order: .reverse) private var records: [RecordEntity]
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var showingForm = false
    @State private var editing: RecordEntity?

    private var currentBaby: ProfileEntity? {
        let resolved = CurrentBaby.resolve(storedId: UUID(uuidString: currentBabyIdString),
                                           profileIds: profiles.map { $0.id })
        return profiles.first { $0.id == resolved }
    }

    private var today: [RecordEntity] {
        records.filter { $0.babyId == currentBaby?.id && Calendar.current.isDateInToday($0.timestamp) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let p = currentBaby {
                    Section {
                        Text("\(p.name)　\(BabyAgeCalculator.age(birthDate: p.birthDate, asOf: Date()).displayText)")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Section("今日記錄（\(today.count) 筆）") {
                    ForEach(today) { entity in
                        Button { editing = entity } label: { RecordRow(data: entity.data) }
                            .buttonStyle(.plain)
                    }
                    .onDelete { indexSet in
                        for i in indexSet { context.delete(today[i]) }
                    }
                }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) }
                ToolbarItem(placement: .primaryAction) {
                    Button { showingForm = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingForm) {
                RecordEntryForm { data in
                    var d = data
                    d.babyId = ensureCurrentBaby().id
                    context.insert(RecordEntity(data: d))
                }
            }
            .sheet(item: $editing) { entity in
                RecordEntryForm(initial: entity.data) { data in entity.apply(data) }
            }
        }
    }

    /// 無任何寶寶時自動建預設寶寶，記錄流程不中斷。
    private func ensureCurrentBaby() -> ProfileEntity {
        if let c = currentBaby { return c }
        let p = ProfileEntity(name: "BabyMonster",
                              birthDate: Calendar.current.startOfDay(for: Date()))
        context.insert(p)
        currentBabyIdString = p.id.uuidString
        return p
    }
}
```

- [ ] **Step 3: RecordEntryForm 保留 babyId**

`RecordEntryForm.swift` 兩處小改：
1. `private let existingID: UUID` 下方加 `private let existingBabyId: UUID?`；`init` 內 `self.existingID = ...` 之後加 `self.existingBabyId = initial?.babyId`
2. `save()` 建構 `RecordData(...)` 之後（`onSave(data)` 之前）改為：
```swift
        var data = RecordData(
            id: existingID, timestamp: timestamp,
            feedAmount: Double(feedText.trimmingCharacters(in: .whitespaces)),
            stoolColor: stoolColor, stoolAmount: stoolAmount, stoolShape: stoolShape,
            hasUrine: hasUrine,
            temperature: Double(tempText.trimmingCharacters(in: .whitespaces)),
            weight: Double(weightText.trimmingCharacters(in: .whitespaces)),
            note: note.isEmpty ? nil : note)
        data.babyId = existingBabyId
        onSave(data)
```

- [ ] **Step 4: 建置驗證**

Run: 建置指令。Expected: `** BUILD SUCCEEDED **`。再跑測試指令確認 44 tests 全綠。

- [ ] **Step 5: Commit**

```bash
git add BabyMonster/Views/BabyPickerMenu.swift BabyMonster/Views/RecordView.swift BabyMonster/Views/RecordEntryForm.swift
git commit -m "Multi-baby 5/8: baby picker menu + record view filtered by current baby"
```

---

### Task 6: 統計頁與趨勢頁過濾

**Files:**
- Modify: `BabyMonster/Views/DailyStatsView.swift`
- Modify: `BabyMonster/Views/TrendView.swift`

**Interfaces:**
- Consumes: `BabyPickerMenu`, `CurrentBaby.resolve`

- [ ] **Step 1: DailyStatsView**

在 struct 內加：
```swift
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""

    private var currentBaby: ProfileEntity? {
        let resolved = CurrentBaby.resolve(storedId: UUID(uuidString: currentBabyIdString),
                                           profileIds: profiles.map { $0.id })
        return profiles.first { $0.id == resolved }
    }
```
`summary` 改為：
```swift
    private var summary: DailySummary {
        let babyRecords = records.filter { $0.babyId == currentBaby?.id }
        return DailyStats.summary(for: date, records: babyRecords.map { $0.data })
    }
```
`.navigationTitle("每日統計")` 之後加：
```swift
            .toolbar { ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) } }
```

- [ ] **Step 2: TrendView**

同樣加 `profiles` @Query、`currentBabyIdString` @AppStorage、`currentBaby` computed（程式碼同上）。
`chart` 內 `records.map { $0.data }` 改為 `records.filter { $0.babyId == currentBaby?.id }.map { $0.data }`。
`.navigationTitle("趨勢")` 之後加同一行 toolbar。

- [ ] **Step 3: 建置驗證**（`** BUILD SUCCEEDED **` + 測試全綠）

- [ ] **Step 4: Commit**

```bash
git add BabyMonster/Views/DailyStatsView.swift BabyMonster/Views/TrendView.swift
git commit -m "Multi-baby 6/8: stats and trend views filter by current baby"
```

---

### Task 7: 設定頁寶寶清單管理

**Files:**
- Create: `BabyMonster/Views/BabyEditView.swift`
- Modify: `BabyMonster/Views/SettingsView.swift`（寶寶資料區塊改清單；匯出/匯入區塊 Task 8 再動）

**Interfaces:**
- Consumes: `ProfileEntity`, `RecordEntity`, `BabyAgeCalculator`
- Produces: `BabyEditView(baby: ProfileEntity?)`（nil = 新增模式）；SettingsView 寶寶清單（編輯/新增/滑動刪除＋確認框連動刪記錄）。

- [ ] **Step 1: BabyEditView**

`BabyMonster/Views/BabyEditView.swift`:
```swift
import SwiftUI
import SwiftData

/// 編輯（baby != nil）或新增（baby == nil）寶寶。
struct BabyEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let baby: ProfileEntity?

    @State private var name: String
    @State private var birthDate: Date

    init(baby: ProfileEntity?) {
        self.baby = baby
        _name = State(initialValue: baby?.name ?? "")
        _birthDate = State(initialValue: baby?.birthDate ?? Calendar.current.startOfDay(for: Date()))
    }

    var body: some View {
        Form {
            TextField("名字", text: $name)
            DatePicker("生日", selection: $birthDate, displayedComponents: .date)
            Text("目前年齡：\(BabyAgeCalculator.age(birthDate: birthDate, asOf: Date()).displayText)")
                .foregroundStyle(.secondary)
        }
        .navigationTitle(baby == nil ? "新增寶寶" : "編輯寶寶")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("儲存") { save() }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .dismissKeyboardOnTap()
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let baby {
            baby.name = trimmed; baby.birthDate = birthDate
        } else {
            context.insert(ProfileEntity(name: trimmed, birthDate: birthDate))
        }
        dismiss()
    }
}
```

- [ ] **Step 2: SettingsView 寶寶區塊改清單**

替換 SettingsView：
1. 刪除 state：`name`、`birthDate`；刪除 `loadProfile()`、`saveProfile()`、`private var profile` 與 `.onAppear { loadProfile() }`。
2. 加 state：
```swift
    @State private var showingNewBaby = false
    @State private var babyToDelete: ProfileEntity?
```
3. `Section("寶寶資料")` 整段換成：
```swift
                Section("寶寶") {
                    ForEach(profiles, id: \.id) { p in
                        NavigationLink {
                            BabyEditView(baby: p)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name)
                                Text(BabyAgeCalculator.age(birthDate: p.birthDate, asOf: Date()).displayText)
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        if let i = indexSet.first { babyToDelete = profiles[i] }
                    }
                    Button("新增寶寶") { showingNewBaby = true }
                        .buttonStyle(.borderedProminent)
                }
```
4. `profiles` 的 @Query 加排序：`@Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]`
5. Form 的 modifier 鏈（`.toast($toast)` 之前）加：
```swift
            .sheet(isPresented: $showingNewBaby) {
                NavigationStack { BabyEditView(baby: nil) }
            }
            .alert(item: $babyToDelete) { baby in
                let count = records.filter { $0.babyId == baby.id }.count
                return Alert(
                    title: Text("刪除「\(baby.name)」？"),
                    message: Text("將一併刪除該寶寶的 \(count) 筆記錄，此動作無法復原。"),
                    primaryButton: .destructive(Text("刪除")) { deleteBaby(baby) },
                    secondaryButton: .cancel(Text("取消")))
            }
```
6. 加方法：
```swift
    private func deleteBaby(_ baby: ProfileEntity) {
        for r in records where r.babyId == baby.id { context.delete(r) }
        context.delete(baby)
        toast = Toast(text: "已刪除寶寶")
    }
```
7. `ProfileEntity` 需 `Identifiable` 供 `.alert(item:)` 使用 — @Model 已含 PersistentIdentifier 但 `.alert(item:)` 要 Identifiable：`ProfileEntity` 已有 `id: UUID` 屬性，於 `BabyMonster/Models/ProfileEntity.swift` 的 class 宣告加上 `Identifiable` conformance（`final class ProfileEntity: Identifiable`，Swift 自動用 `id` 屬性）。
8. 匯出相關：`prepareExport()` 內原本引用已刪除的 `name`/`birthDate` state — 暫時改為（Task 8 會全面改寫）：
```swift
    private func prepareExport() {
        guard let first = profiles.first else {
            toast = Toast(text: "尚無寶寶資料可匯出", duration: 2.5); return
        }
        let payload = BackupPayload(profile: first.data, records: records.map { $0.data })
        // ...其餘不變
    }
```
   `handleImport` 內 `if profile == nil` 改為 `if profiles.isEmpty`。

- [ ] **Step 3: 建置驗證**（`** BUILD SUCCEEDED **` + 測試全綠）

- [ ] **Step 4: Commit**

```bash
git add BabyMonster/Views/BabyEditView.swift BabyMonster/Views/SettingsView.swift BabyMonster/Models/ProfileEntity.swift
git commit -m "Multi-baby 7/8: baby list management (add/edit/delete with cascade)"
```

---

### Task 8: 匯出範圍選擇 + 匯入 v2 + 啟動遷移接線 + e2e

**Files:**
- Modify: `BabyMonster/Views/SettingsView.swift`（匯出/匯入改 v2）
- Modify: `BabyMonster/RootTabView.swift`（啟動遷移）
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: `DataTransfer.encodeV2/decodeAny/mergeBabies`, `BackupPayloadV2`, `LegacyMigration.run`

- [ ] **Step 1: 匯出範圍選擇（SettingsView）**

1. 加 state：`@State private var showingExportOptions = false`
2. 匯出按鈕改為：
```swift
                    Button("匯出資料（分享給家人）") { showingExportOptions = true }
                        .buttonStyle(.bordered)
                        .confirmationDialog("選擇匯出範圍", isPresented: $showingExportOptions, titleVisibility: .visible) {
                            Button("全部寶寶") { prepareExport(baby: nil) }
                            ForEach(profiles, id: \.id) { p in
                                Button(p.name) { prepareExport(baby: p) }
                            }
                        }
```
3. `prepareExport` 全面改寫：
```swift
    private func sanitized(_ s: String) -> String {
        s.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
    }

    private func prepareExport(baby: ProfileEntity?) {
        let selectedProfiles = baby.map { [$0.data] } ?? profiles.map { $0.data }
        guard !selectedProfiles.isEmpty else {
            toast = Toast(text: "尚無寶寶資料可匯出", duration: 2.5); return
        }
        let ids = Set(selectedProfiles.map { $0.id })
        let selectedRecords = records.map { $0.data }
            .filter { $0.babyId.map(ids.contains) ?? false }
        let payload = BackupPayloadV2(profiles: selectedProfiles, records: selectedRecords)
        do {
            let data = try DataTransfer.encodeV2(payload)
            let f = DateFormatter(); f.dateFormat = "yyyyMMdd"
            let base = baby.map { "BabyMonster-\(sanitized($0.name))" } ?? "BabyMonster"
            let fileURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(base)-\(f.string(from: Date())).json")
            try data.write(to: fileURL, options: .atomic)
            shareItem = ShareItem(url: fileURL)
            toast = Toast(text: "已產生匯出檔，可透過分享選單傳給家人（例如 LINE）")
        } catch { toast = Toast(text: "匯出失敗：\(error.localizedDescription)", duration: 2.5) }
    }
```
4. 移除 Task 7 暫時版 `prepareExport()` 與 `exportFilename`。

- [ ] **Step 2: 匯入 v2（SettingsView）**

`handleImport` 的成功分支改為：
```swift
            do {
                let incoming = try DataTransfer.decodeAny(try Data(contentsOf: url))
                let merged = DataTransfer.mergeBabies(
                    localProfiles: profiles.map { $0.data },
                    localRecords: records.map { $0.data },
                    incomingProfiles: incoming.profiles,
                    incomingRecords: incoming.records)
                let existingProfileIds = Set(profiles.map { $0.id })
                for p in merged.profiles where !existingProfileIds.contains(p.id) {
                    context.insert(ProfileEntity(data: p))
                }
                let existingRecordIds = Set(records.map { $0.id })
                for r in merged.records where !existingRecordIds.contains(r.id) {
                    context.insert(RecordEntity(data: r))
                }
                toast = Toast(text: "已匯入並合併：寶寶 \(merged.profiles.count) 位、共 \(merged.records.count) 筆記錄")
            } catch { toast = Toast(text: "匯入失敗：\(error.localizedDescription)", duration: 2.5) }
```

- [ ] **Step 3: 啟動遷移接線（RootTabView）**

`BabyMonster/RootTabView.swift`：
```swift
import SwiftUI
import SwiftData

struct RootTabView: View {
    @Environment(\.modelContext) private var context

    var body: some View {
        TabView {
            RecordView().tabItem { Label("記錄", systemImage: "square.and.pencil") }
            DailyStatsView().tabItem { Label("統計", systemImage: "list.bullet.rectangle") }
            TrendView().tabItem { Label("趨勢", systemImage: "chart.xyaxis.line") }
            SettingsView().tabItem { Label("設定", systemImage: "gearshape") }
        }
        .task { try? LegacyMigration.run(context: context) }
    }
}
```

- [ ] **Step 4: 全套測試**

Run: 測試指令。Expected: `** TEST SUCCEEDED **`（44 tests）。

- [ ] **Step 5: e2e 模擬器驗證**

```bash
xcrun simctl boot "iPhone 17 Pro" 2>/dev/null || true
xcodebuild build -project BabyMonster.xcodeproj -scheme BabyMonster -destination 'platform=iOS Simulator,name=iPhone 17 Pro' CODE_SIGNING_ALLOWED=NO -derivedDataPath ./build
xcrun simctl install "iPhone 17 Pro" ./build/Build/Products/Debug-iphonesimulator/BabyMonster.app
xcrun simctl launch "iPhone 17 Pro" com.wsturkey6.BabyMonster
sleep 4
xcrun simctl io "iPhone 17 Pro" screenshot .superpowers/sdd/multibaby-launch.png
```
READ 截圖：App 開啟到 4 分頁、不 crash。（既有模擬器資料若含舊記錄，遷移後應照常顯示於預設寶寶下。）`./build/` 已 gitignore，勿 stage。

- [ ] **Step 6: 更新 PROGRESS.md（多寶寶功能完成標記）並 Commit**

```bash
git add BabyMonster/Views/SettingsView.swift BabyMonster/RootTabView.swift PROGRESS.md
git commit -m "Multi-baby 8/8: v2 export/import wiring, scoped export, startup migration"
```

---

## Self-Review

**Spec coverage：** §3 模型 → Task 1；§4 遷移 → Task 2 + Task 8 接線；§5 當前寶寶/切換/自動建寶/無寶狀態 → Task 3 + 5 + 6（BabyPickerMenu 無寶寶時隱藏、統計/趨勢空資料自然成立）；§6 寶寶管理 → Task 7；§7 匯出/匯入 v2 + v1 相容 + 名字對應 → Task 4 + 8；§8 測試 → Tasks 1–4 TDD + 8 e2e；§9/10 無對應任務需求。✓

**Placeholder scan：** 無 TBD/TODO；每步含完整程式碼與指令。✓

**Type consistency：** `CurrentBaby.resolve(storedId:profileIds:)` 於 Task 3 定義、Task 5/6 使用一致；`mergeBabies` 簽名 Task 4 定義、Task 8 使用一致；`BackupPayloadV2(profiles:records:)`（version 預設 2）一致；`RecordEntity` memberwise init 尾參數 `babyId` 與 Task 2 測試呼叫一致；`ProfileEntity(id:name:birthDate:)` 與 Task 2 `testDeduplicatesProfileIds` 呼叫一致。✓

**已知風險：** SwiftData 對既有多列填相同預設 id 的行為不確定 → Task 2 的 id 去重步驟兜底；`.alert(item:)` 需 Identifiable → Task 7 第 7 點處理。
