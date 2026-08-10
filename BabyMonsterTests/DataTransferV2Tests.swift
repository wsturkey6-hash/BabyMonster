import XCTest
@testable import BabyMonster

final class DataTransferV2Tests: XCTestCase {
    func rec(_ id: UUID, _ t: TimeInterval, baby: UUID?, feed: Double? = nil) -> RecordData {
        var r = RecordData(id: id, timestamp: Date(timeIntervalSince1970: t), feedAmount: feed,
                           stoolColor: nil, stoolAmount: nil, stoolShape: nil, hasUrine: false,
                           temperature: nil, weight: nil, note: nil)
        r.babyId = baby
        return r
    }

    func testV2RoundTrip() throws {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let payload = BackupPayloadV2(profiles: [baby],
                                      records: [rec(UUID(), 1000, baby: baby.id, feed: 100)])
        let decoded = try DataTransfer.decodeAny(DataTransfer.encodeV2(payload))
        XCTAssertEqual(decoded, payload)
    }

    func testDecodeV1FileConvertsToV2() throws {
        let v1Json = """
        {"profile":{"name":"Old","birthDate":"2024-05-20T00:00:00Z"},
         "records":[{"id":"00000000-0000-0000-0000-000000000001",
                     "timestamp":"2026-01-01T08:00:00Z","hasUrine":true}]}
        """.data(using: .utf8)!
        let v2 = try DataTransfer.decodeAny(v1Json)
        XCTAssertEqual(v2.profiles.count, 1)
        XCTAssertEqual(v2.profiles.first?.name, "Old")
        XCTAssertEqual(v2.records.count, 1)
        XCTAssertEqual(v2.records.first?.babyId, v2.profiles.first?.id) // 全綁該寶寶
    }

    func testMergeBabiesMatchById() {
        let baby = ProfileData(name: "同id", birthDate: Date(timeIntervalSince1970: 0))
        var incomingBaby = baby; incomingBaby.name = "改過名"     // 同 id、不同名 → 本機為準
        let result = DataTransfer.mergeBabies(
            localProfiles: [baby], localRecords: [],
            incomingProfiles: [incomingBaby], incomingRecords: [rec(UUID(), 1, baby: baby.id)])
        XCTAssertEqual(result.profiles.count, 1)
        XCTAssertEqual(result.profiles.first?.name, "同id")
        XCTAssertEqual(result.records.count, 1)
    }

    func testMergeBabiesMatchByNameRemapsBabyId() {
        let localBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let remoteBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 50)) // 不同 id 同名
        let r1 = rec(UUID(), 1000, baby: remoteBaby.id, feed: 60)
        let result = DataTransfer.mergeBabies(
            localProfiles: [localBaby], localRecords: [],
            incomingProfiles: [remoteBaby], incomingRecords: [r1])
        XCTAssertEqual(result.profiles.count, 1)                       // 不新增寶寶
        XCTAssertEqual(result.records.first?.babyId, localBaby.id)     // babyId 重對映
    }

    func testMergeBabiesNewBabyAppended() {
        let localBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let newBaby = ProfileData(name: "小美", birthDate: Date(timeIntervalSince1970: 99))
        let r1 = rec(UUID(), 1000, baby: newBaby.id)
        let result = DataTransfer.mergeBabies(
            localProfiles: [localBaby], localRecords: [],
            incomingProfiles: [newBaby], incomingRecords: [r1])
        XCTAssertEqual(result.profiles.count, 2)
        XCTAssertEqual(result.records.first?.babyId, newBaby.id)       // 不重對映
    }

    func testUrineAmountRoundTripsThroughV2() throws {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        var r = rec(UUID(), 1000, baby: baby.id, feed: 100)
        r.hasUrine = true
        r.urineAmount = .many
        let payload = BackupPayloadV2(profiles: [baby], records: [r])
        let decoded = try DataTransfer.decodeAny(DataTransfer.encodeV2(payload))
        XCTAssertEqual(decoded.records.first?.urineAmount, .many)
    }

    func testUrineAmountUsesWebCompatibleJSONKeyAndValue() throws {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        var r = rec(UUID(), 1000, baby: baby.id)
        r.hasUrine = true
        r.urineAmount = .medium
        let json = String(data: try DataTransfer.encodeV2(
            BackupPayloadV2(profiles: [baby], records: [r])), encoding: .utf8)!
        XCTAssertTrue(json.contains("\"urineAmount\" : \"medium\""))
    }

    func testDecodesFileWithoutUrineAmount() throws {
        let json = """
        {"version":2,
         "profiles":[{"id":"11111111-1111-1111-1111-111111111111","name":"小明",
                      "birthDate":"2025-11-02T00:00:00Z"}],
         "records":[{"id":"22222222-2222-2222-2222-222222222222",
                     "babyId":"11111111-1111-1111-1111-111111111111",
                     "timestamp":"2026-01-01T08:00:00Z","hasUrine":true}]}
        """.data(using: .utf8)!
        let v2 = try DataTransfer.decodeAny(json)
        XCTAssertNil(v2.records.first?.urineAmount)
    }

    func testSleepRoundTripsWithWebCompatibleValue() throws {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        var r = rec(UUID(), 1000, baby: baby.id)
        r.sleep = .start
        let data = try DataTransfer.encodeV2(BackupPayloadV2(profiles: [baby], records: [r]))
        XCTAssertTrue(String(data: data, encoding: .utf8)!.contains("\"sleep\" : \"start\""))
        XCTAssertEqual(try DataTransfer.decodeAny(data).records.first?.sleep, .start)
    }

    func testMergeBabiesRecordDedupLocalWins() {
        let baby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let shared = UUID()
        let localRec = rec(shared, 1000, baby: baby.id, feed: 100)
        let incomingRec = rec(shared, 1000, baby: baby.id, feed: 999)
        let result = DataTransfer.mergeBabies(
            localProfiles: [baby], localRecords: [localRec],
            incomingProfiles: [baby], incomingRecords: [incomingRec])
        XCTAssertEqual(result.records.count, 1)
        XCTAssertEqual(result.records.first?.feedAmount, 100)
    }

    // MARK: - 接種紀錄

    private func dose(_ babyId: UUID, _ vaccineId: String, _ label: String,
                      _ date: Date) -> VaccineDoseData {
        VaccineDoseData(babyId: babyId, vaccineId: vaccineId, doseLabel: label, date: date)
    }

    func testEmptyVaccineDosesAreOmittedFromTheFile() throws {
        let p = BackupPayloadV2(profiles: [], records: [])
        let json = String(data: try DataTransfer.encodeV2(p), encoding: .utf8)!
        XCTAssertFalse(json.contains("vaccineDoses"))
    }

    func testVaccineDosesRoundTrip() throws {
        let baby = UUID()
        let d = dose(baby, "dtap-hib-ipv", "第一劑", Date(timeIntervalSince1970: 1_770_000_000))
        let data = try DataTransfer.encodeV2(BackupPayloadV2(profiles: [], records: [],
                                                             vaccineDoses: [d]))
        XCTAssertEqual(try DataTransfer.decodeAny(data).vaccineDoses, [d])
    }

    func testFileWithoutVaccineDosesDecodesToEmpty() throws {
        let json = """
        {"version":2,"profiles":[],"records":[]}
        """.data(using: .utf8)!
        XCTAssertEqual(try DataTransfer.decodeAny(json).vaccineDoses, [])
    }

    func testMergeKeepsLocalDoseOnConflict() {
        let baby = UUID()
        let local = dose(baby, "hepb", "第一劑", Date(timeIntervalSince1970: 1_000_000))
        let incoming = dose(baby, "hepb", "第一劑", Date(timeIntervalSince1970: 2_000_000))
        let r = DataTransfer.mergeBabies(
            localProfiles: [], localRecords: [], incomingProfiles: [], incomingRecords: [],
            localVaccineDoses: [local], incomingVaccineDoses: [incoming])
        XCTAssertEqual(r.vaccineDoses, [local])
    }

    func testMergeRemapsDoseBabyIdWhenProfilesMatchByName() {
        let localBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let remoteBaby = ProfileData(name: "小明", birthDate: Date(timeIntervalSince1970: 0))
        let d = dose(remoteBaby.id, "hepb", "第一劑", Date(timeIntervalSince1970: 1_000_000))
        let r = DataTransfer.mergeBabies(
            localProfiles: [localBaby], localRecords: [],
            incomingProfiles: [remoteBaby], incomingRecords: [],
            localVaccineDoses: [], incomingVaccineDoses: [d])
        XCTAssertEqual(r.profiles.count, 1)
        XCTAssertEqual(r.vaccineDoses.first?.babyId, localBaby.id)
    }

    func testMergeSortsDosesByKey() {
        let baby = UUID()
        let first = dose(baby, "hepb", "第一劑", Date(timeIntervalSince1970: 1_000_000))
        let second = dose(baby, "hepb", "第二劑", Date(timeIntervalSince1970: 2_000_000))
        let r = DataTransfer.mergeBabies(
            localProfiles: [], localRecords: [], incomingProfiles: [], incomingRecords: [],
            localVaccineDoses: [second], incomingVaccineDoses: [first])
        XCTAssertEqual(r.vaccineDoses.map(\.doseLabel), ["第一劑", "第二劑"])
    }
}
