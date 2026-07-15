import XCTest
@testable import BabyMonster

final class ModelCodableTests: XCTestCase {
    func testRecordDataRoundTrip() throws {
        let rec = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: 1_700_000_000),
                             feedAmount: 120, stoolColor: 7, stoolAmount: .medium, stoolShape: .type4,
                             hasUrine: true, temperature: 36.8, weight: 4200, note: "ok")
        let data = try JSONEncoder().encode(rec)
        let decoded = try JSONDecoder().decode(RecordData.self, from: data)
        XCTAssertEqual(rec, decoded)
    }
    func testHasStool() {
        var r = RecordData(id: UUID(), timestamp: Date(), feedAmount: nil, stoolColor: 3,
                           stoolAmount: nil, stoolShape: nil, hasUrine: false, temperature: nil, weight: nil, note: nil)
        XCTAssertTrue(r.hasStool)
        r.stoolColor = nil
        XCTAssertFalse(r.hasStool)
    }
    func testProfileRoundTrip() throws {
        let p = ProfileData(name: "BabyMonster", birthDate: Date(timeIntervalSince1970: 1_600_000_000))
        let decoded = try JSONDecoder().decode(ProfileData.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(p, decoded)
    }
}
