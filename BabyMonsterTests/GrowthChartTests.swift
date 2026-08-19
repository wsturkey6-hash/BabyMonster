import XCTest
@testable import BabyMonster

final class GrowthChartTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)

    func d(_ y: Int, _ m: Int, _ day: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day, hour: h))!
    }

    func baby(sex: Sex? = .male) -> ProfileData {
        ProfileData(id: UUID(), name: "寶寶", birthDate: d(2025, 9, 1, 0), sex: sex)
    }

    func rec(_ date: Date, weight: Double? = nil, height: Double? = nil, head: Double? = nil) -> RecordData {
        RecordData(id: UUID(), timestamp: date, feedAmount: nil, stoolColor: nil,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false,
                   temperature: nil, weight: weight, height: height, headCircumference: head, note: nil)
    }

    // MARK: - 參考線

    func testReferenceBandsMatchTheirPercentiles() {
        XCTAssertEqual(GrowthChart.referenceBands.count, 5)
        for band in GrowthChart.referenceBands {
            XCTAssertEqual(GrowthPercentile.normalCdf(band.z) * 100, Double(band.percentile),
                           accuracy: 1e-9, "P\(band.percentile)")
        }
    }

    func testReferenceBandsAreAscending() {
        XCTAssertEqual(GrowthChart.referenceBands.map { $0.percentile }, [3, 15, 50, 85, 97])
    }

    // MARK: - 取值與換算

    func testMetricValueConvertsWeightToKilograms() {
        XCTAssertEqual(GrowthChart.metricValue(.weight, rec(d(2026, 1, 1), weight: 7250)), 7.25)
    }

    func testMetricValueUsesCentimetresDirectly() {
        XCTAssertEqual(GrowthChart.metricValue(.height, rec(d(2026, 1, 1), height: 68.5)), 68.5)
        XCTAssertEqual(GrowthChart.metricValue(.headCirc, rec(d(2026, 1, 1), head: 44.2)), 44.2)
    }

    func testMetricValueNilWhenAbsent() {
        XCTAssertNil(GrowthChart.metricValue(.weight, rec(d(2026, 1, 1))))
        XCTAssertNil(GrowthChart.metricValue(.height, rec(d(2026, 1, 1), weight: 7000)))
    }

    func testChartMaxMonthsPicksFirstStepAtOrAboveAge() {
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 0), 3)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 60), 3)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 150), 6)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 250), 12)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 400), 24)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 800), 36)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 1856), 60)
        XCTAssertEqual(GrowthChart.chartMaxMonths(ageDays: 99999), 60)
    }

    // MARK: - 最新測量

    func testLatestPicksNewestRecordAndComputesPercentile() {
        let p = baby()
        let records = [rec(d(2025, 10, 1), weight: 4200),
                       rec(d(2025, 12, 1), weight: 6100),
                       rec(d(2025, 11, 1), weight: 5300)]
        let m = GrowthChart.latest(metric: .weight, profile: p, records: records, calendar: cal)!
        XCTAssertEqual(m.value, 6.1, accuracy: 1e-9)
        XCTAssertEqual(m.ageDays, 91)
        XCTAssertNotNil(m.result)
        XCTAssertGreaterThan(m.result!.percentile, 0)
        XCTAssertLessThan(m.result!.percentile, 100)
    }

    func testEachMetricTracksItsOwnLatestRecord() {
        let p = baby()
        let records = [rec(d(2025, 12, 1), weight: 6100, height: 60),
                       rec(d(2026, 1, 15), weight: 6800)]
        XCTAssertEqual(GrowthChart.latest(metric: .weight, profile: p, records: records, calendar: cal)!.date,
                       d(2026, 1, 15))
        XCTAssertEqual(GrowthChart.latest(metric: .height, profile: p, records: records, calendar: cal)!.date,
                       d(2025, 12, 1))
    }

    func testLatestNilWhenNoRecords() {
        let p = baby()
        XCTAssertNil(GrowthChart.latest(metric: .headCirc, profile: p,
                                        records: [rec(d(2025, 12, 1), weight: 6100)], calendar: cal))
        XCTAssertNil(GrowthChart.latest(metric: .weight, profile: p, records: [], calendar: cal))
    }

    func testLatestWithoutSexStillReturnsValueButNoPercentile() {
        let p = baby(sex: nil)
        let m = GrowthChart.latest(metric: .weight, profile: p,
                                   records: [rec(d(2025, 12, 1), weight: 6100)], calendar: cal)!
        XCTAssertEqual(m.value, 6.1, accuracy: 1e-9)
        XCTAssertNil(m.result)
    }

    func testRecordsBeforeBirthAreIgnored() {
        let p = baby()
        XCTAssertNil(GrowthChart.latest(metric: .weight, profile: p,
                                        records: [rec(d(2025, 8, 20), weight: 3200)], calendar: cal))
    }

    func testBeyondFiveYearsKeepsValueButDropsPercentile() {
        let p = baby()
        let m = GrowthChart.latest(metric: .weight, profile: p,
                                   records: [rec(d(2031, 9, 1), weight: 20000)], calendar: cal)!
        XCTAssertEqual(m.value, 20, accuracy: 1e-9)
        XCTAssertGreaterThan(m.ageDays, GrowthPercentile.dayMax)
        XCTAssertNil(m.result)
    }

    // MARK: - 測量序列

    func testSeriesSortedByAgeAndFiltered() {
        let p = baby()
        let records = [rec(d(2025, 12, 1), weight: 6100),
                       rec(d(2025, 10, 1), weight: 4200),
                       rec(d(2025, 11, 1), height: 57)]
        let s = GrowthChart.series(metric: .weight, profile: p, records: records, calendar: cal)
        XCTAssertEqual(s.map { $0.value }, [4.2, 6.1])
        XCTAssertLessThan(s[0].ageDays, s[1].ageDays)
    }

    func testSeriesExcludesOutOfRangePoints() {
        let p = baby()
        let records = [rec(d(2025, 8, 1), weight: 3000),
                       rec(d(2025, 12, 1), weight: 6100),
                       rec(d(2031, 9, 1), weight: 20000)]
        XCTAssertEqual(GrowthChart.series(metric: .weight, profile: p, records: records, calendar: cal)
                        .map { $0.value }, [6.1])
    }

    func testSeriesAveragesSameDayMeasurements() {
        let p = baby()
        let records = [rec(d(2025, 12, 1, 8), weight: 6000),
                       rec(d(2025, 12, 1, 20), weight: 6200)]
        let s = GrowthChart.series(metric: .weight, profile: p, records: records, calendar: cal)
        XCTAssertEqual(s.count, 1)
        XCTAssertEqual(s[0].value, 6.1, accuracy: 1e-9)
    }

    func testSeriesEmptyWhenNoRecords() {
        XCTAssertEqual(GrowthChart.series(metric: .weight, profile: baby(), records: [], calendar: cal).count, 0)
    }

    // MARK: - 參考曲線

    func testCurvesShareSameSampleGrid() {
        let curves = GrowthChart.referenceCurves(metric: .weight, sex: .male, maxDays: 365)
        XCTAssertEqual(curves.count, 5)
        let n = curves[0].points.count
        for c in curves {
            XCTAssertEqual(c.points.count, n)
            XCTAssertEqual(c.points.first!.ageDays, 0)
            XCTAssertEqual(c.points.last!.ageDays, 365)
        }
    }

    func testHigherPercentileAlwaysLarger() {
        let curves = GrowthChart.referenceCurves(metric: .weight, sex: .male, maxDays: 365)
        for i in 0..<curves[0].points.count {
            for k in 1..<curves.count {
                XCTAssertGreaterThan(curves[k].points[i].value, curves[k - 1].points[i].value)
            }
        }
    }

    func testP50IsTheWhoMedian() {
        let p50 = GrowthChart.referenceCurves(metric: .height, sex: .female, maxDays: 200)
            .first { $0.percentile == 50 }!
        XCTAssertEqual(p50.points.first!.value, 49.1477, accuracy: 1e-4)
    }

    func testDiscontinuityIsPreservedInSampling() {
        let c = GrowthChart.referenceCurves(metric: .height, sex: .male, maxDays: 1000)
            .first { $0.percentile == 50 }!
        let days = c.points.map { $0.ageDays }
        XCTAssertTrue(days.contains(730))
        XCTAssertTrue(days.contains(731))
        let v730 = c.points.first { $0.ageDays == 730 }!.value
        let v731 = c.points.first { $0.ageDays == 731 }!.value
        XCTAssertEqual(v730 - v731, 0.6715, accuracy: 1e-3)
    }

    func testMaxDaysClamped() {
        let c = GrowthChart.referenceCurves(metric: .weight, sex: .male, maxDays: 99999)[0]
        XCTAssertEqual(c.points.last!.ageDays, GrowthPercentile.dayMax)
    }

    func testSampleCountStaysReasonable() {
        for maxDays in [90, 365, 1856] {
            let c = GrowthChart.referenceCurves(metric: .weight, sex: .male, maxDays: maxDays)[0]
            XCTAssertLessThanOrEqual(c.points.count, 130, "maxDays \(maxDays)")
            XCTAssertGreaterThan(c.points.count, 10, "maxDays \(maxDays)")
        }
    }

    // MARK: - 顯示格式

    func testFormatPercentile() {
        let lms = GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: 365)!
        let mid = GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365,
                                          value: lms.M)!
        XCTAssertEqual(GrowthChart.formatPercentile(mid), "50")

        let low = GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365,
                                          value: GrowthPercentile.value(lms: lms, z: -3.5))!
        XCTAssertEqual(GrowthChart.formatPercentile(low), "< 0.1")

        let high = GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365,
                                           value: GrowthPercentile.value(lms: lms, z: 3.5))!
        XCTAssertEqual(GrowthChart.formatPercentile(high), "> 99.9")
    }

    func testBandLabels() {
        let lms = GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: 365)!
        func label(z: Double) -> String {
            GrowthChart.bandLabel(GrowthPercentile.result(
                metric: .weight, sex: .male, ageDays: 365,
                value: GrowthPercentile.value(lms: lms, z: z))!)
        }
        XCTAssertEqual(label(z: 0), "第 15–85 百分位（中段）")
        XCTAssertEqual(label(z: -2.5), "低於第 3 百分位")
        XCTAssertEqual(label(z: 2.5), "高於第 97 百分位")
        XCTAssertEqual(label(z: -1.5), "第 3–15 百分位")
        XCTAssertEqual(label(z: 1.5), "第 85–97 百分位")
    }
}
