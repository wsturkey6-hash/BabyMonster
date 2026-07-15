import XCTest
import SwiftData
@testable import BabyMonster

final class PersistenceMappingTests: XCTestCase {
    @MainActor
    func testRecordEntityRoundTripThroughStore() throws {
        let container = try AppModelContainer.makeInMemory()
        let ctx = container.mainContext
        let original = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: 1000),
                                  feedAmount: 90, stoolColor: 8, stoolAmount: .many, stoolShape: .type6,
                                  hasUrine: true, temperature: 36.9, weight: 3800, note: "n")
        ctx.insert(RecordEntity(data: original))
        try ctx.save()
        let fetched = try ctx.fetch(FetchDescriptor<RecordEntity>())
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched.first?.data, original)
    }

    @MainActor
    func testProfileEntityMapping() throws {
        let p = ProfileData(name: "BabyMonster", birthDate: Date(timeIntervalSince1970: 500))
        let e = ProfileEntity(data: p)
        XCTAssertEqual(e.data, p)
    }
}
