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

    func testProfileDataDecodeWithoutIdGetsGeneratedId() throws {
        let json = #"{"name":"Old","birthDate":"2024-05-20T00:00:00Z"}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let p = try decoder.decode(ProfileData.self, from: json)
        XCTAssertEqual(p.name, "Old")
        // id 自動產生，不會 throw
    }

    func testRecordDataBabyIdRoundTrip() throws {
        let bid = UUID()
        var rec = RecordData(id: UUID(), timestamp: Date(timeIntervalSince1970: 1000),
                             feedAmount: 50, stoolColor: nil, stoolAmount: nil, stoolShape: nil,
                             hasUrine: false, temperature: nil, weight: nil, note: nil)
        rec.babyId = bid
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let decoded = try decoder.decode(RecordData.self, from: encoder.encode(rec))
        XCTAssertEqual(decoded.babyId, bid)
        XCTAssertEqual(decoded, rec)
    }

    func testRecordDataDecodeWithoutBabyIdIsNil() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","timestamp":"2026-01-01T00:00:00Z","hasUrine":false}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let r = try decoder.decode(RecordData.self, from: json)
        XCTAssertNil(r.babyId)
    }
}
