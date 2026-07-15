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
}
