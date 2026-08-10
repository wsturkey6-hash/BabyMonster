import XCTest
@testable import BabyMonster

final class VaccineLogTests: XCTestCase {
    let cal = Calendar(identifier: .gregorian)
    let baby = UUID(uuidString: "AAAA1111-2222-3333-4444-555566667777")!

    func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d))!
    }

    var birth: Date { day(2026, 7, 22) }

    /// 兩支測試用疫苗：A 有 2、4 個月兩劑，B 只有 4 個月一劑（驗證同月齡的排序）。
    let fake: [Vaccine] = [
        Vaccine(id: "a", name: "A", en: "A", description: "測試用疫苗說明文字，長度足夠通過檢查。",
                doses: [VaccineDose(label: "第一劑", ageMonths: 2, funding: .publicFunded),
                        VaccineDose(label: "第二劑", ageMonths: 4, funding: .publicFunded)]),
        Vaccine(id: "b", name: "B", en: "B", description: "測試用疫苗說明文字，長度足夠通過檢查。",
                doses: [VaccineDose(label: "一劑", ageMonths: 4, funding: .selfPaid)]),
    ]

    func names(_ ds: [ScheduledDose]) -> [String] {
        ds.map { "\($0.vaccine.id):\($0.dose.label)" }
    }

    func overdue(_ now: Date, done: [String: Date] = [:]) -> [ScheduledDose] {
        VaccineLog.overdue(birthDate: birth, asOf: now, babyId: baby,
                           done: done, calendar: cal, vaccines: fake)
    }

    // MARK: - key

    func testKeyJoinsBabyVaccineAndDose() {
        XCTAssertEqual(VaccineLog.key(babyId: baby, vaccineId: "dtap-hib-ipv", doseLabel: "第一劑"),
                       "\(baby.uuidString)|dtap-hib-ipv|第一劑")
    }

    func testDoseDataDerivesItsOwnKey() {
        let d = VaccineDoseData(babyId: baby, vaccineId: "hepb", doseLabel: "第一劑",
                                date: day(2026, 3, 15))
        XCTAssertEqual(d.key, VaccineLog.key(babyId: baby, vaccineId: "hepb", doseLabel: "第一劑"))
    }

    func testDoneKeysMapsKeyToDate() {
        let d = VaccineDoseData(babyId: baby, vaccineId: "a", doseLabel: "第一劑",
                                date: day(2026, 9, 20))
        let map = VaccineLog.doneKeys([d])
        XCTAssertEqual(map[d.key], day(2026, 9, 20))
        XCTAssertNil(map[VaccineLog.key(babyId: baby, vaccineId: "a", doseLabel: "第二劑")])
    }

    // MARK: - overdue

    func testOverdueOnlyCountsDosesDueBeforeToday() {
        XCTAssertEqual(names(overdue(day(2026, 10, 1))), ["a:第一劑"])
    }

    func testDoseDueTodayIsNotOverdue() {
        XCTAssertEqual(overdue(day(2026, 9, 22)).count, 0)
    }

    func testOverdueStartsTheDayAfter() {
        XCTAssertEqual(names(overdue(day(2026, 9, 23))), ["a:第一劑"])
    }

    func testLateInTheDayStillNotOverdue() {
        let late = cal.date(byAdding: .hour, value: 23, to: day(2026, 9, 22))!
        XCTAssertEqual(overdue(late).count, 0)
    }

    func testRecordedDoseIsNotOverdue() {
        let done = VaccineLog.doneKeys([
            VaccineDoseData(babyId: baby, vaccineId: "a", doseLabel: "第一劑", date: day(2026, 9, 25))
        ])
        XCTAssertEqual(overdue(day(2026, 10, 1), done: done).count, 0)
    }

    func testOverdueSortsByAgeThenDefinitionOrder() {
        XCTAssertEqual(names(overdue(day(2027, 1, 1))), ["a:第一劑", "a:第二劑", "b:一劑"])
    }

    func testAnotherBabysRecordDoesNotCount() {
        let done = VaccineLog.doneKeys([
            VaccineDoseData(babyId: UUID(), vaccineId: "a", doseLabel: "第一劑", date: day(2026, 9, 25))
        ])
        XCTAssertEqual(names(overdue(day(2026, 10, 1), done: done)), ["a:第一劑"])
    }

    // MARK: - next 的已完成判斷

    func testNextSkipsAFullyRecordedMilestone() {
        let m = Vaccines.next(birthDate: birth, asOf: day(2026, 8, 1), calendar: cal,
                              vaccines: fake, isDone: { $0.dose.ageMonths == 2 })
        XCTAssertEqual(m?.ageMonths, 4)
    }

    func testNextKeepsAPartiallyRecordedMilestone() {
        let m = Vaccines.next(birthDate: birth, asOf: day(2026, 8, 1), calendar: cal,
                              vaccines: fake,
                              isDone: { $0.vaccine.id == "a" && $0.dose.ageMonths == 4 })
        XCTAssertEqual(m?.ageMonths, 2)
    }
}
