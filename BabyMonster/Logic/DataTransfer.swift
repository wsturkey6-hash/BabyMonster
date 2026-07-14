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
