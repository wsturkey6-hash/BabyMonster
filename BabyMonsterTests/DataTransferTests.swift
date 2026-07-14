import XCTest
@testable import BabyMonster

final class DataTransferTests: XCTestCase {
    func rec(_ id: UUID, _ t: TimeInterval, feed: Double? = nil) -> RecordData {
        RecordData(id: id, timestamp: Date(timeIntervalSince1970: t), feedAmount: feed, stoolColor: nil,
                   stoolAmount: nil, stoolShape: nil, hasUrine: false, temperature: nil, weight: nil, note: nil)
    }

    func testPayloadRoundTrip() throws {
        let payload = BackupPayload(
            profile: ProfileData(name: "BabyMonster", birthDate: Date(timeIntervalSince1970: 1_600_000_000)),
            records: [rec(UUID(), 1000, feed: 100), rec(UUID(), 2000, feed: 120)])
        let decoded = try DataTransfer.decode(DataTransfer.encode(payload))
        XCTAssertEqual(decoded, payload)
    }

    func testMergeUnionById() {
        let shared = UUID()
        let local = [rec(shared, 1000, feed: 100), rec(UUID(), 2000, feed: 200)]
        let incoming = [rec(shared, 1000, feed: 999), rec(UUID(), 3000, feed: 300)]
        let merged = DataTransfer.mergeRecords(local: local, incoming: incoming)
        XCTAssertEqual(merged.count, 3) // 共享 id 只算一次
        // 重複 id 保留 local（feed 100 而非 999）
        XCTAssertEqual(merged.first(where: { $0.id == shared })?.feedAmount, 100)
        // 依 timestamp 排序
        XCTAssertEqual(merged.map { $0.timestamp }, merged.map { $0.timestamp }.sorted())
    }

    func testMergeEmptyIncoming() {
        let local = [rec(UUID(), 1000)]
        XCTAssertEqual(DataTransfer.mergeRecords(local: local, incoming: []).count, 1)
    }
}
