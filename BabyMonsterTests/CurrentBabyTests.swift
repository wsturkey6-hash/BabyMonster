import XCTest
@testable import BabyMonster

final class CurrentBabyTests: XCTestCase {
    func testStoredIdMatches() {
        let a = UUID(), b = UUID()
        XCTAssertEqual(CurrentBaby.resolve(storedId: b, profileIds: [a, b]), b)
    }
    func testStoredIdMissingFallsBackToFirst() {
        let a = UUID(), b = UUID()
        XCTAssertEqual(CurrentBaby.resolve(storedId: UUID(), profileIds: [a, b]), a)
    }
    func testNilStoredFallsBackToFirst() {
        let a = UUID()
        XCTAssertEqual(CurrentBaby.resolve(storedId: nil, profileIds: [a]), a)
    }
    func testEmptyProfilesReturnsNil() {
        XCTAssertNil(CurrentBaby.resolve(storedId: UUID(), profileIds: []))
    }
}
