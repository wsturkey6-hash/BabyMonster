import XCTest
@testable import BabyMonster

final class BabyRecordsTests: XCTestCase {
    func rec(_ baby: UUID?, _ t: TimeInterval = 0) -> RecordData {
        var r = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: t), feedAmount: nil,
                           stoolColor: nil, stoolAmount: nil, stoolShape: nil, hasUrine: false,
                           temperature: nil, weight: nil, note: nil)
        r.babyId = baby
        return r
    }

    func testBelongingToSingleBabyExcludesOthersAndNil() {
        let a = UUID(), b = UUID()
        let records = [rec(a), rec(b), rec(nil), rec(a)]
        let result = BabyRecords.belonging(to: a, in: records)
        XCTAssertEqual(result.count, 2)
        XCTAssertTrue(result.allSatisfy { $0.babyId == a })
    }

    func testBelongingToSetExcludesNilAndNonMembers() {
        let a = UUID(), b = UUID(), c = UUID()
        let records = [rec(a), rec(b), rec(c), rec(nil)]
        let result = BabyRecords.belonging(to: [a, b], in: records)
        XCTAssertEqual(result.count, 2)
        XCTAssertTrue(result.allSatisfy { $0.babyId == a || $0.babyId == b })
    }

    func testEmptySetMatchesNothing() {
        XCTAssertTrue(BabyRecords.belonging(to: Set<UUID>(), in: [rec(UUID())]).isEmpty)
    }
}
