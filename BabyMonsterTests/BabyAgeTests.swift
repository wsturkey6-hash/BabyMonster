import XCTest
@testable import BabyMonster

final class BabyAgeTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)
    func d(_ y: Int, _ m: Int, _ day: Int) -> Date { cal.date(from: DateComponents(year: y, month: m, day: day))! }

    func testBirthdayItself() {
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 15), asOf: d(2026, 1, 15), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 0, months: 0, days: 0))
    }
    func testDaysOnly() {
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 1), asOf: d(2026, 1, 11), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 0, months: 0, days: 10))
    }
    func testMonthsAndDays() {
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 10), asOf: d(2026, 3, 15), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 0, months: 2, days: 5))
    }
    func testCrossMonthBorrow() {
        // 出生 1/31，asOf 3/1：跨月借位
        let a = BabyAgeCalculator.age(birthDate: d(2026, 1, 31), asOf: d(2026, 3, 1), calendar: cal)
        XCTAssertEqual(a.months, 1)
        XCTAssertEqual(a.years, 0)
    }
    func testYears() {
        let a = BabyAgeCalculator.age(birthDate: d(2024, 5, 20), asOf: d(2026, 7, 15), calendar: cal)
        XCTAssertEqual(a, BabyAge(years: 2, months: 1, days: 25))
    }
    func testDisplayText() {
        XCTAssertEqual(BabyAge(years: 1, months: 2, days: 3).displayText, "1 歲 2 個月又 3 天")
    }
}
