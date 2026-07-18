import Foundation

struct BackupPayload: Codable, Equatable {
    var profile: ProfileData
    var records: [RecordData]
}

enum DataTransfer {
    static func encode(_ payload: BackupPayload) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(payload)
    }

    static func decode(_ data: Data) throws -> BackupPayload {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(BackupPayload.self, from: data)
    }

    /// 以 id 聯集去重；重複 id 保留 local；結果依 timestamp 排序。
    static func mergeRecords(local: [RecordData], incoming: [RecordData]) -> [RecordData] {
        var byId: [UUID: RecordData] = [:]
        for r in incoming { byId[r.id] = r }
        for r in local { byId[r.id] = r } // local 覆蓋 incoming
        return byId.values.sorted { $0.timestamp < $1.timestamp }
    }
}

// MARK: - v2（多寶寶）

struct BackupPayloadV2: Codable, Equatable {
    var version: Int = 2
    var profiles: [ProfileData]
    var records: [RecordData]
}

extension DataTransfer {
    static func encodeV2(_ payload: BackupPayloadV2) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(payload)
    }

    /// 先試 v2；失敗退回 v1 並轉換（v1 記錄全綁其 profile 的 id）。
    static func decodeAny(_ data: Data) throws -> BackupPayloadV2 {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let v2 = try? decoder.decode(BackupPayloadV2.self, from: data) { return v2 }
        let v1 = try decoder.decode(BackupPayload.self, from: data)
        let records = v1.records.map { r -> RecordData in
            var r = r; r.babyId = v1.profile.id; return r
        }
        return BackupPayloadV2(profiles: [v1.profile], records: records)
    }

    /// 寶寶合併：id 對中 → 本機為準；名字對中 → 重對映進來記錄的 babyId；都沒中 → 新增。
    /// 記錄再走 mergeRecords（id 聯集去重、本機優先、依 timestamp 排序）。
    static func mergeBabies(localProfiles: [ProfileData], localRecords: [RecordData],
                            incomingProfiles: [ProfileData], incomingRecords: [RecordData])
        -> (profiles: [ProfileData], records: [RecordData]) {
        var profiles = localProfiles
        var idRemap: [UUID: UUID] = [:]
        for p in incomingProfiles {
            if localProfiles.contains(where: { $0.id == p.id }) { continue }
            if let match = localProfiles.first(where: { $0.name == p.name }) {
                idRemap[p.id] = match.id
            } else {
                profiles.append(p)
            }
        }
        let remapped = incomingRecords.map { r -> RecordData in
            var r = r
            if let bid = r.babyId, let mapped = idRemap[bid] { r.babyId = mapped }
            return r
        }
        return (profiles, mergeRecords(local: localRecords, incoming: remapped))
    }
}
