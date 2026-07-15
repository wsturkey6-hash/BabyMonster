import XCTest
@testable import BabyMonster

final class TrendSeriesTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)
    func d(_ y: Int, _ m: Int, _ day: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day, hour: h))!
    }
    func rec(_ date: Date, feed: Double? = nil, stool: Int? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: feed, stoolColor: stool,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false, temperature: nil, weight: nil, note: nil)
    }

    func testSeriesLengthAndOrder() {
        let pts = TrendSeries.series(metric: .totalFeed, days: 7, endingOn: d(2026, 7, 15),
                                     records: [], calendar: cal)
        XCTAssertEqual(pts.count, 7)
        XCTAssertEqual(pts.map { $0.date }, pts.map { $0.date }.sorted())
        XCTAssertEqual(cal.dateComponents([.day], from: pts.first!.date, to: pts.last!.date).day, 6)
    }

    func testTotalFeedPerDay() {
        let records = [rec(d(2026, 7, 15, 8), feed: 100), rec(d(2026, 7, 15, 12), feed: 50),
                       rec(d(2026, 7, 14, 9), feed: 30)]
        let pts = TrendSeries.series(metric: .totalFeed, days: 2, endingOn: d(2026, 7, 15),
                                     records: records, calendar: cal)
        XCTAssertEqual(pts[0].value, 30)   // 7/14
        XCTAssertEqual(pts[1].value, 150)  // 7/15
    }

    func testAvgTempNilWhenNoData() {
        let pts = TrendSeries.series(metric: .avgTemperature, days: 1, endingOn: d(2026, 7, 15),
                                     records: [], calendar: cal)
        XCTAssertNil(pts[0].value)
    }
}
