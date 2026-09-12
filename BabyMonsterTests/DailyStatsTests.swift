import XCTest
@testable import BabyMonster

final class DailyStatsTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func makeDate(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    func rec(_ date: Date, feed: Double? = nil, stool: Int? = nil, urine: Bool = false,
             temp: Double? = nil, weight: Double? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: feed, stoolColor: stool,
                   stoolAmount: nil, stoolShape: nil, hasUrine: urine, temperature: temp, weight: weight, note: nil)
    }

    func testEmptyDay() {
        let s = DailyStats.summary(for: makeDate(2026, 7, 15), records: [], calendar: cal)
        XCTAssertEqual(s, DailySummary(stoolCount: 0, urineCount: 0, totalFeed: 0, averageTemperature: nil, averageWeight: nil))
    }

    func testCountsAndSums() {
        let day = makeDate(2026, 7, 15)
        let records = [
            rec(makeDate(2026, 7, 15, 8), feed: 100, stool: 7, urine: true, temp: 36.5, weight: 4000),
            rec(makeDate(2026, 7, 15, 12), feed: 120, urine: true),
            rec(makeDate(2026, 7, 15, 18), stool: 3, temp: 37.5, weight: 4100),
        ]
        let s = DailyStats.summary(for: day, records: records, calendar: cal)
        XCTAssertEqual(s.stoolCount, 2)
        XCTAssertEqual(s.urineCount, 2)
        XCTAssertEqual(s.totalFeed, 220)
        XCTAssertEqual(s.averageTemperature!, 37.0, accuracy: 0.001)
        XCTAssertEqual(s.averageWeight!, 4050, accuracy: 0.001)
    }

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

    func testOnlyCountsSelectedDay() {
        let day = makeDate(2026, 7, 15)
        let records = [
            rec(makeDate(2026, 7, 15, 8), feed: 100),
            rec(makeDate(2026, 7, 14, 23), feed: 999), // 前一天
            rec(makeDate(2026, 7, 16, 0), feed: 999),  // 後一天
        ]
        let s = DailyStats.summary(for: day, records: records, calendar: cal)
        XCTAssertEqual(s.totalFeed, 100)
    }

    // MARK: - 最少喝奶量（最近一次體重 kg × 100 ml）

    func testNoWeightMeansNoFeedTarget() {
        let records = [rec(makeDate(2026, 7, 15), feed: 100)]
        XCTAssertNil(DailyStats.feedTarget(for: makeDate(2026, 7, 15), records: records, calendar: cal))
    }

    func testFeedTargetIsWeightInKgTimesHundred() {
        let weighed = makeDate(2026, 7, 15, 9)
        let target = DailyStats.feedTarget(for: makeDate(2026, 7, 15),
                                           records: [rec(weighed, weight: 5250)], calendar: cal)
        XCTAssertEqual(target, FeedTarget(minimum: 525, weight: 5250, timestamp: weighed))
    }

    func testFeedTargetUsesLastWeightUpToEndOfDay() {
        let records = [
            rec(makeDate(2026, 7, 10), weight: 4000),
            rec(makeDate(2026, 7, 15, 8), weight: 5000),
            rec(makeDate(2026, 7, 15, 20), weight: 5100), // 同一天更晚的一筆
            rec(makeDate(2026, 7, 16), weight: 9000),     // 選定日之後
        ]
        let target = DailyStats.feedTarget(for: makeDate(2026, 7, 15), records: records, calendar: cal)
        XCTAssertEqual(target?.minimum, 510)
    }

    /// 補記體重後，先前那幾天也要看得到目標。
    func testFeedTargetFallsBackToFirstWeightWhenNoneBefore() {
        let records = [rec(makeDate(2026, 7, 20), weight: 5000), rec(makeDate(2026, 7, 25), weight: 5400)]
        XCTAssertEqual(DailyStats.feedTarget(for: makeDate(2026, 7, 15), records: records, calendar: cal)?.weight, 5000)
    }

    func testFeedTargetIgnoresRecordOrder() {
        let records = [
            rec(makeDate(2026, 7, 16), weight: 9000),
            rec(makeDate(2026, 7, 15, 8), weight: 5000),
            rec(makeDate(2026, 7, 10), weight: 4000),
        ]
        XCTAssertEqual(DailyStats.feedTarget(for: makeDate(2026, 7, 15), records: records, calendar: cal)?.weight, 5000)
    }
}
