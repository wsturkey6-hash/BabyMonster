import XCTest
@testable import BabyMonster

final class StoolColorTests: XCTestCase {
    func testColors1To6AreAbnormal() {
        for n in 1...6 { XCTAssertTrue(StoolColorCard.isAbnormal(n), "\(n) should be abnormal") }
    }
    func testColors7To9AreNormal() {
        for n in 7...9 { XCTAssertFalse(StoolColorCard.isAbnormal(n), "\(n) should be normal") }
    }
    func testBoundary6Abnormal7Normal() {
        XCTAssertTrue(StoolColorCard.isAbnormal(6))
        XCTAssertFalse(StoolColorCard.isAbnormal(7))
    }
    func testAllHasNineCards() {
        XCTAssertEqual(StoolColorCard.all, Array(1...9))
    }
    func testStoolAmountCases() {
        XCTAssertEqual(StoolAmount.allCases.count, 3)
    }
    func testBristolRange() {
        XCTAssertEqual(BristolType.allCases.first?.rawValue, 1)
        XCTAssertEqual(BristolType.allCases.last?.rawValue, 7)
    }
}
