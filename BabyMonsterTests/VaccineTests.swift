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

    func testMilestoneOnTheDayIsStillUpcoming() {
        let birth = day(2026, 7, 22)
        let onTheDay = Vaccines.doseDate(birthDate: birth, ageMonths: 2, calendar: cal)
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: onTheDay, calendar: cal)?.ageMonths, 2)
        let late = cal.date(byAdding: .hour, value: 23, to: onTheDay)!
        XCTAssertEqual(Vaccines.next(birthDate: birth, asOf: late, calendar: cal)?.ageMonths, 2)
    }

    func testReturnsNilWhenEverythingHasPassed() {
        XCTAssertNil(Vaccines.next(birthDate: day(2026, 7, 22), asOf: day(2040, 1, 1), calendar: cal))
    }
}
