import XCTest
import SwiftData
@testable import BabyMonster

final class LegacyMigrationTests: XCTestCase {
    // NOTE: `ModelContext` does not strongly retain its `ModelContainer` on
    // this toolchain (Xcode 26.6 / iOS 26.5 SDK) — if `makeInMemory()`'s
    // result isn't kept alive somewhere, the container is deallocated as soon
    // as `makeContext()` returns and any later use of the context (e.g.
    // `ctx.insert(...)`) crashes (reproducibly, `EXC_BREAKPOINT` inside
    // SwiftData.framework). Stashing the container on the test case keeps it
    // alive for the lifetime of each test.
    private var container: ModelContainer!

    @MainActor
    func makeContext() throws -> ModelContext {
        container = try AppModelContainer.makeInMemory()
        return container.mainContext
    }

    @MainActor
    func testAssignsOrphanRecordsToFirstProfile() throws {
        let ctx = try makeContext()
        let baby = ProfileEntity(name: "A", birthDate: Date(timeIntervalSince1970: 0))
        ctx.insert(baby)
        let rec = RecordEntity(id: UUID(), timestamp: Date(), feedAmount: 10, stoolColor: nil,
                               stoolAmountRaw: nil, stoolShapeRaw: nil, hasUrine: false,
                               temperature: nil, weight: nil, note: nil, babyId: nil)
        ctx.insert(rec)
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        XCTAssertEqual(rec.babyId, baby.id)
    }

    @MainActor
    func testCreatesDefaultBabyWhenNoneExists() throws {
        let ctx = try makeContext()
        let rec = RecordEntity(id: UUID(), timestamp: Date(), feedAmount: nil, stoolColor: 7,
                               stoolAmountRaw: nil, stoolShapeRaw: nil, hasUrine: false,
                               temperature: nil, weight: nil, note: nil, babyId: nil)
        ctx.insert(rec)
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        let profiles = try ctx.fetch(FetchDescriptor<ProfileEntity>())
        XCTAssertEqual(profiles.count, 1)
        XCTAssertEqual(profiles.first?.name, "BabyMonster")
        XCTAssertEqual(rec.babyId, profiles.first?.id)
    }

    @MainActor
    func testIdempotent() throws {
        let ctx = try makeContext()
        let baby = ProfileEntity(name: "A", birthDate: Date(timeIntervalSince1970: 0))
        ctx.insert(baby)
        let rec = RecordEntity(id: UUID(), timestamp: Date(), feedAmount: 10, stoolColor: nil,
                               stoolAmountRaw: nil, stoolShapeRaw: nil, hasUrine: false,
                               temperature: nil, weight: nil, note: nil, babyId: nil)
        ctx.insert(rec)
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        let firstAssign = rec.babyId
        try LegacyMigration.run(context: ctx)   // 再跑一次
        XCTAssertEqual(rec.babyId, firstAssign)
        XCTAssertEqual(try ctx.fetch(FetchDescriptor<ProfileEntity>()).count, 1)
    }

    @MainActor
    func testDeduplicatesProfileIds() throws {
        let ctx = try makeContext()
        let shared = UUID()
        ctx.insert(ProfileEntity(id: shared, name: "A", birthDate: Date(timeIntervalSince1970: 0)))
        ctx.insert(ProfileEntity(id: shared, name: "B", birthDate: Date(timeIntervalSince1970: 100)))
        try ctx.save()
        try LegacyMigration.run(context: ctx)
        let ids = try ctx.fetch(FetchDescriptor<ProfileEntity>()).map { $0.id }
        XCTAssertEqual(Set(ids).count, 2)
    }
}
