import XCTest
@testable import BabyMonster

/// 共用的 fixture 讀取：測試檔在 BabyMonsterTests/ 之下，往上一層就是 repo 根目錄。
/// 用 #filePath 而非 bundle resource，就不必動到專案設定。
enum GrowthFixtures {
    static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // BabyMonsterTests/
            .deletingLastPathComponent()   // repo root
    }

    static func json(_ name: String) throws -> [String: Any] {
        let url = repoRoot.appendingPathComponent("data").appendingPathComponent(name)
        let data = try Data(contentsOf: url)
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }
}

final class NormalCdfTests: XCTestCase {
    func testKnownValues() {
        XCTAssertEqual(GrowthPercentile.normalCdf(0), 0.5, accuracy: 1e-12)
        XCTAssertEqual(GrowthPercentile.normalCdf(1.959963985), 0.975, accuracy: 1e-9)
        XCTAssertEqual(GrowthPercentile.normalCdf(-1.959963985), 0.025, accuracy: 1e-9)
        XCTAssertEqual(GrowthPercentile.normalCdf(1), 0.841344746, accuracy: 1e-9)
        XCTAssertEqual(GrowthPercentile.normalCdf(-3), 0.001349898, accuracy: 1e-9)
    }

    func testSymmetryAndMonotonic() {
        for i in -16...16 {
            let z = Double(i) * 0.25
            XCTAssertEqual(GrowthPercentile.normalCdf(z) + GrowthPercentile.normalCdf(-z), 1, accuracy: 1e-12)
        }
        var prev = -1.0
        for i in -50...50 {
            let v = GrowthPercentile.normalCdf(Double(i) * 0.1)
            XCTAssertGreaterThan(v, prev)
            prev = v
        }
    }

    func testExtremes() {
        XCTAssertEqual(GrowthPercentile.normalCdf(-40), 0)
        XCTAssertEqual(GrowthPercentile.normalCdf(40), 1)
    }
}

final class LmsMathTests: XCTestCase {
    func testLZeroUsesLogBranch() {
        let lms = Lms(L: 0, M: 10, S: 0.1)
        XCTAssertEqual(GrowthPercentile.value(lms: lms, z: 0), 10, accuracy: 1e-12)
        XCTAssertEqual(GrowthPercentile.value(lms: lms, z: 1), 10 * exp(0.1), accuracy: 1e-12)
        XCTAssertEqual(GrowthPercentile.zScore(lms: lms, value: 10 * exp(0.1)), 1, accuracy: 1e-12)
    }

    func testRoundTrip() {
        let lms = Lms(L: -0.3521, M: 8.9481, S: 0.12204)
        for z in [-3.0, -1.5, 0, 0.7, 2.4] {
            XCTAssertEqual(GrowthPercentile.zScore(lms: lms, value: GrowthPercentile.value(lms: lms, z: z)),
                           z, accuracy: 1e-10)
        }
    }

    func testZeroZIsMedian() {
        let lms = Lms(L: -0.3521, M: 8.9481, S: 0.12204)
        XCTAssertEqual(GrowthPercentile.value(lms: lms, z: 0), 8.9481, accuracy: 1e-12)
    }
}

final class GrowthReferenceTableTests: XCTestCase {
    func testOutOfRangeReturnsNil() {
        XCTAssertNil(GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: -1))
        XCTAssertNil(GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: GrowthPercentile.dayMax + 1))
        XCTAssertNotNil(GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: 0))
        XCTAssertNotNil(GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: GrowthPercentile.dayMax))
    }

    func testAllMetricsAndSexesPresent() {
        for metric in GrowthMetric.allCases {
            for sex in Sex.allCases {
                XCTAssertNotNil(GrowthPercentile.lms(metric: metric, sex: sex, ageDays: 100),
                                "\(metric.rawValue)/\(sex.rawValue)")
            }
        }
    }

    func testBirthMedians() {
        XCTAssertEqual(GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: 0)!.M, 3.3464, accuracy: 1e-4)
        XCTAssertEqual(GrowthPercentile.lms(metric: .height, sex: .male, ageDays: 0)!.M, 49.8842, accuracy: 1e-4)
        XCTAssertEqual(GrowthPercentile.lms(metric: .headCirc, sex: .male, ageDays: 0)!.M, 34.4618, accuracy: 1e-4)
    }

    /// WHO 在滿 2 歲從躺姿身長改成站姿身高，中位數會陡降約 0.67cm。
    func testLengthToHeightDiscontinuity() {
        let a = GrowthPercentile.lms(metric: .height, sex: .male, ageDays: 730)!.M
        let b = GrowthPercentile.lms(metric: .height, sex: .male, ageDays: 731)!.M
        XCTAssertEqual(a - b, 0.6715, accuracy: 1e-3)
    }
}

final class WhoVerificationTests: XCTestCase {
    /// WHO 的 SD 欄位印成 3 位小數，但 M 本身給到 4 位。第 4 位正好是 5 時差距
    /// 正好等於容差，浮點誤差會讓它些微超過，所以比較時補一點 slack。
    private let slack = 1e-9

    func testAgainstWhoPublishedSdColumns() throws {
        let root = try GrowthFixtures.json("who-growth-verification.json")
        let tolerance = root["tolerance"] as! Double
        let cases = root["cases"] as! [[String: Any]]
        XCTAssertGreaterThan(cases.count, 600)

        var bad: [String] = []
        for c in cases {
            let metric = GrowthMetric(rawValue: c["metric"] as! String)!
            let sex = Sex(rawValue: c["sex"] as! String)!
            let day = c["day"] as! Int
            let z = (c["z"] as! NSNumber).doubleValue
            let expected = (c["expected"] as! NSNumber).doubleValue

            guard let lms = GrowthPercentile.lms(metric: metric, sex: sex, ageDays: day) else {
                bad.append("\(metric.rawValue)/\(sex.rawValue) day \(day): 無資料")
                continue
            }
            let got = GrowthPercentile.value(lms: lms, z: z)
            if abs(got - expected) > tolerance + slack {
                bad.append("\(metric.rawValue)/\(sex.rawValue) day \(day) z \(z): \(got) vs \(expected)")
            }
        }
        XCTAssertEqual(bad, [], "與 WHO 自家發布的 SD 欄位不符")
    }
}

final class CrossPlatformVectorTests: XCTestCase {
    /// 與網頁版對照同一份期望值，任一邊實作走鐘就會紅。
    func testMatchesSharedVectors() throws {
        let root = try GrowthFixtures.json("growth-percentile-vectors.json")
        let zTol = root["zTolerance"] as! Double
        let pTol = root["percentileTolerance"] as! Double
        let cases = root["cases"] as! [[String: Any]]

        var bad: [String] = []
        for c in cases {
            let metric = GrowthMetric(rawValue: c["metric"] as! String)!
            let sex = Sex(rawValue: c["sex"] as! String)!
            let ageDays = c["ageDays"] as! Int
            let value = (c["value"] as! NSNumber).doubleValue
            let expectedZ = (c["z"] as! NSNumber).doubleValue
            let expectedP = (c["percentile"] as! NSNumber).doubleValue

            guard let r = GrowthPercentile.result(metric: metric, sex: sex, ageDays: ageDays, value: value) else {
                bad.append("\(metric.rawValue)/\(sex.rawValue) day \(ageDays): 回傳 nil")
                continue
            }
            if abs(r.z - expectedZ) > zTol {
                bad.append("\(metric.rawValue)/\(sex.rawValue) day \(ageDays) z: \(r.z) vs \(expectedZ)")
            }
            if abs(r.percentile - expectedP) > pTol {
                bad.append("\(metric.rawValue)/\(sex.rawValue) day \(ageDays) p: \(r.percentile) vs \(expectedP)")
            }
        }
        XCTAssertEqual(bad, [], "與網頁版的共用測試向量不符")
    }
}

final class GrowthResultTests: XCTestCase {
    func testMedianIsFiftieth() {
        let m = GrowthPercentile.lms(metric: .weight, sex: .female, ageDays: 365)!.M
        let r = GrowthPercentile.result(metric: .weight, sex: .female, ageDays: 365, value: m)!
        XCTAssertEqual(r.percentile, 50, accuracy: 1e-9)
        XCTAssertEqual(r.z, 0, accuracy: 1e-9)
        XCTAssertNil(r.beyond)
    }

    func testOutOfAgeRangeReturnsNil() {
        XCTAssertNil(GrowthPercentile.result(metric: .weight, sex: .male,
                                             ageDays: GrowthPercentile.dayMax + 1, value: 20))
        XCTAssertNil(GrowthPercentile.result(metric: .weight, sex: .male, ageDays: -1, value: 3))
    }

    func testBeyondThreeSigma() {
        let lms = GrowthPercentile.lms(metric: .weight, sex: .male, ageDays: 365)!
        let low = GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365,
                                          value: GrowthPercentile.value(lms: lms, z: -3.5))!
        XCTAssertEqual(low.beyond, .low)
        XCTAssertEqual(low.z, -3.5, accuracy: 1e-6)

        let high = GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365,
                                           value: GrowthPercentile.value(lms: lms, z: 3.5))!
        XCTAssertEqual(high.beyond, .high)

        let mid = GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365,
                                          value: GrowthPercentile.value(lms: lms, z: 2.9))!
        XCTAssertNil(mid.beyond)
    }

    func testNonPositiveOrNonFiniteValueReturnsNil() {
        for v in [0, -5, Double.nan, Double.infinity] {
            XCTAssertNil(GrowthPercentile.result(metric: .weight, sex: .male, ageDays: 365, value: v), "\(v)")
        }
    }
}

final class AgeInDaysTests: XCTestCase {
    var cal = Calendar(identifier: .gregorian)
    func d(_ y: Int, _ m: Int, _ day: Int, _ h: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: day, hour: h))!
    }

    func testSameDayIsZero() {
        XCTAssertEqual(GrowthPercentile.ageInDays(birthDate: d(2026, 3, 10, 6),
                                                  asOf: d(2026, 3, 10, 23), calendar: cal), 0)
    }

    func testIncrements() {
        XCTAssertEqual(GrowthPercentile.ageInDays(birthDate: d(2026, 3, 10), asOf: d(2026, 3, 11), calendar: cal), 1)
        XCTAssertEqual(GrowthPercentile.ageInDays(birthDate: d(2026, 3, 10), asOf: d(2026, 4, 10), calendar: cal), 31)
    }

    func testLeapYear() {
        XCTAssertEqual(GrowthPercentile.ageInDays(birthDate: d(2024, 2, 28), asOf: d(2024, 3, 1), calendar: cal), 2)
    }

    func testBeforeBirthIsNegative() {
        XCTAssertEqual(GrowthPercentile.ageInDays(birthDate: d(2026, 3, 10), asOf: d(2026, 3, 9), calendar: cal), -1)
    }

    func testIgnoresTimeOfDay() {
        XCTAssertEqual(GrowthPercentile.ageInDays(birthDate: d(2026, 3, 10, 23),
                                                  asOf: d(2026, 3, 11, 1), calendar: cal), 1)
    }
}
