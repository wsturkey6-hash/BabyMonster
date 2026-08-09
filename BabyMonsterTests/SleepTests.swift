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
