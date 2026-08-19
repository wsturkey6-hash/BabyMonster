import XCTest
@testable import BabyMonster

final class GrowthBackupCompatTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func d(_ y: Int, _ m: Int, _ day: Int) -> Date {
        cal.date(from: DateComponents(timeZone: TimeZone(identifier: "UTC"), year: y, month: m, day: day))!
    }

    func profile(sex: Sex? = nil) -> ProfileData {
        ProfileData(id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
                    name: "小明", birthDate: d(2025, 9, 1), sex: sex)
    }

    func record(height: Double? = nil, head: Double? = nil) -> RecordData {
        RecordData(id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
                   timestamp: d(2026, 1, 15), feedAmount: nil, stoolColor: nil,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false,
                   temperature: nil, weight: 7250, height: height, headCircumference: head,
                   note: nil)
    }

    private func encodedJSON(_ payload: BackupPayloadV2) throws -> [String: Any] {
        let data = try DataTransfer.encodeV2(payload)
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }

    func testVersionStaysTwo() throws {
        let payload = BackupPayloadV2(profiles: [profile(sex: .male)],
                                      records: [record(height: 68.5, head: 44.2)])
        XCTAssertEqual(try encodedJSON(payload)["version"] as? Int, 2)
    }

    func testNewFieldsRoundTrip() throws {
        let payload = BackupPayloadV2(profiles: [profile(sex: .female)],
                                      records: [record(height: 68.5, head: 44.2)])
        let back = try DataTransfer.decodeAny(try DataTransfer.encodeV2(payload))
        XCTAssertEqual(back.profiles[0].sex, .female)
        XCTAssertEqual(back.records[0].height, 68.5)
        XCTAssertEqual(back.records[0].headCircumference, 44.2)
        XCTAssertEqual(back.records[0].weight, 7250)
    }

    /// 沒用到新功能時，輸出不能冒出空鍵 —— 這是與舊版 App 逐字節相容的關鍵。
    func testUnusedFieldsAreOmitted() throws {
        let json = try encodedJSON(BackupPayloadV2(profiles: [profile()], records: [record()]))
        let p = (json["profiles"] as! [[String: Any]])[0]
        let r = (json["records"] as! [[String: Any]])[0]
        XCTAssertNil(p["sex"])
        XCTAssertNil(r["height"])
        XCTAssertNil(r["headCircumference"])
        XCTAssertNotNil(r["weight"])
    }

    func testReadingOldFileWithoutNewFields() throws {
        let old = """
        {"version":2,
         "profiles":[{"id":"11111111-1111-1111-1111-111111111111","name":"小明","birthDate":"2025-09-01T00:00:00Z"}],
         "records":[{"id":"22222222-2222-2222-2222-222222222222","babyId":"11111111-1111-1111-1111-111111111111",
                     "timestamp":"2026-01-15T02:00:00Z","hasUrine":false,"weight":7250}]}
        """.data(using: .utf8)!
        let back = try DataTransfer.decodeAny(old)
        XCTAssertNil(back.profiles[0].sex)
        XCTAssertNil(back.records[0].height)
        XCTAssertNil(back.records[0].headCircumference)
        XCTAssertEqual(back.records[0].weight, 7250)
    }

    func testV1FileStillReadable() throws {
        let v1 = """
        {"profile":{"name":"小明","birthDate":"2025-09-01T00:00:00Z"},
         "records":[{"id":"22222222-2222-2222-2222-222222222222",
                     "timestamp":"2026-01-15T02:00:00Z","hasUrine":false}]}
        """.data(using: .utf8)!
        let back = try DataTransfer.decodeAny(v1)
        XCTAssertNil(back.profiles[0].sex)
        XCTAssertEqual(back.records.count, 1)
    }

    func testInvalidSexIsRejected() {
        let bad = """
        {"version":2,
         "profiles":[{"id":"11111111-1111-1111-1111-111111111111","name":"小明",
                      "birthDate":"2025-09-01T00:00:00Z","sex":"other"}],
         "records":[]}
        """.data(using: .utf8)!
        XCTAssertThrowsError(try DataTransfer.decodeAny(bad))
    }
}

final class GrowthPersistenceMappingTests: XCTestCase {
    func testRecordEntityRoundTripsNewFields() {
        let data = RecordData(id: UUID(), timestamp: Date(), feedAmount: nil, stoolColor: nil,
                              stoolAmount: nil, stoolShape: nil, hasUrine: false,
                              temperature: nil, weight: 7250, height: 68.5, headCircumference: 44.2,
                              note: nil)
        let entity = RecordEntity(data: data)
        XCTAssertEqual(entity.height, 68.5)
        XCTAssertEqual(entity.headCircumference, 44.2)
        XCTAssertEqual(entity.data.height, 68.5)
        XCTAssertEqual(entity.data.headCircumference, 44.2)
    }

    func testRecordEntityApplyUpdatesNewFields() {
        let entity = RecordEntity(data: RecordData(id: UUID(), timestamp: Date(), feedAmount: nil,
                                                   stoolColor: nil, stoolAmount: nil, stoolShape: nil,
                                                   hasUrine: false, temperature: nil, weight: nil,
                                                   height: 60, headCircumference: 40, note: nil))
        var updated = entity.data
        updated.height = 68.5
        updated.headCircumference = nil
        entity.apply(updated)
        XCTAssertEqual(entity.height, 68.5)
        XCTAssertNil(entity.headCircumference)
    }

    func testProfileEntityRoundTripsSex() {
        let p = ProfileData(id: UUID(), name: "小明", birthDate: Date(), sex: .female)
        let entity = ProfileEntity(data: p)
        XCTAssertEqual(entity.sexRaw, "female")
        XCTAssertEqual(entity.sex, .female)
        XCTAssertEqual(entity.data.sex, .female)
    }

    func testProfileEntitySexCanBeCleared() {
        let entity = ProfileEntity(data: ProfileData(id: UUID(), name: "小明", birthDate: Date(), sex: .male))
        entity.sex = nil
        XCTAssertNil(entity.sexRaw)
        XCTAssertNil(entity.data.sex)
    }

    func testUnknownSexRawDecodesToNil() {
        let entity = ProfileEntity(name: "小明", birthDate: Date(), sexRaw: "other")
        XCTAssertNil(entity.sex)
    }
}

final class GrowthDailyStatsTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func d(_ y: Int, _ m: Int, _ day: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day, hour: h))!
    }

    func rec(_ date: Date, height: Double? = nil, head: Double? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: nil, stoolColor: nil,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false,
                   temperature: nil, weight: nil, height: height, headCircumference: head, note: nil)
    }

    func testNilWhenNoRecords() {
        let s = DailyStats.summary(for: d(2026, 7, 15), records: [], calendar: cal)
        XCTAssertNil(s.averageHeight)
        XCTAssertNil(s.averageHeadCircumference)
    }

    func testAveragesSameDayMeasurements() {
        let records = [rec(d(2026, 7, 15, 8), height: 68, head: 44),
                       rec(d(2026, 7, 15, 20), height: 69, head: 45)]
        let s = DailyStats.summary(for: d(2026, 7, 15), records: records, calendar: cal)
        XCTAssertEqual(s.averageHeight!, 68.5, accuracy: 1e-9)
        XCTAssertEqual(s.averageHeadCircumference!, 44.5, accuracy: 1e-9)
    }

    func testOnlyCountsThatDay() {
        let records = [rec(d(2026, 7, 14), height: 60), rec(d(2026, 7, 15), height: 68)]
        XCTAssertEqual(DailyStats.summary(for: d(2026, 7, 15), records: records, calendar: cal).averageHeight, 68)
    }

    func testHeightAndHeadAreIndependent() {
        let s = DailyStats.summary(for: d(2026, 7, 15), records: [rec(d(2026, 7, 15), height: 68)], calendar: cal)
        XCTAssertEqual(s.averageHeight, 68)
        XCTAssertNil(s.averageHeadCircumference)
    }
}

final class GrowthTrendMetricTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func d(_ y: Int, _ m: Int, _ day: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day, hour: h))!
    }

    func rec(_ date: Date, weight: Double? = nil, height: Double? = nil, head: Double? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: nil, stoolColor: nil,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false,
                   temperature: nil, weight: weight, height: height, headCircumference: head, note: nil)
    }

    func testHeightSeries() {
        let pts = TrendSeries.series(metric: .avgHeight, days: 3, endingOn: d(2026, 7, 15),
                                     records: [rec(d(2026, 7, 14), height: 68)], calendar: cal)
        XCTAssertEqual(pts.map { $0.value }, [nil, 68, nil])
    }

    func testHeadCircSeries() {
        let pts = TrendSeries.series(metric: .avgHeadCirc, days: 2, endingOn: d(2026, 7, 15),
                                     records: [rec(d(2026, 7, 15), head: 44.5)], calendar: cal)
        XCTAssertEqual(pts.map { $0.value }, [nil, 44.5])
    }

    func testMetricsDoNotBleedIntoEachOther() {
        let records = [rec(d(2026, 7, 15), weight: 7000, height: 68)]
        XCTAssertEqual(TrendSeries.series(metric: .avgWeight, days: 1, endingOn: d(2026, 7, 15),
                                          records: records, calendar: cal)[0].value, 7000)
        XCTAssertEqual(TrendSeries.series(metric: .avgHeight, days: 1, endingOn: d(2026, 7, 15),
                                          records: records, calendar: cal)[0].value, 68)
        XCTAssertNil(TrendSeries.series(metric: .avgHeadCirc, days: 1, endingOn: d(2026, 7, 15),
                                        records: records, calendar: cal)[0].value)
    }

    func testAllMetricsHaveMetadata() {
        XCTAssertEqual(TrendMetric.allCases.count, 7)
        for m in TrendMetric.allCases {
            XCTAssertFalse(m.displayName.isEmpty, m.rawValue)
            XCTAssertFalse(m.unit.isEmpty, m.rawValue)
        }
    }

    /// 與網頁版同一組規則：只有這三個狀態量連接缺口。
    func testOnlyGrowthMetricsConnectGaps() {
        let connected = TrendMetric.allCases.filter { $0.connectsGaps }.map { $0.rawValue }.sorted()
        XCTAssertEqual(connected, ["avgHeadCirc", "avgHeight", "avgWeight"])
    }
}
