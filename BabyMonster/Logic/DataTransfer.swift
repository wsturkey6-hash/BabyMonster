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
    /// 選填：舊檔沒有這一段。空陣列時不寫進檔案，讓沒用這個功能的匯出結果與舊版相同。
    var vaccineDoses: [VaccineDoseData] = []

    init(version: Int = 2, profiles: [ProfileData], records: [RecordData],
         vaccineDoses: [VaccineDoseData] = []) {
        self.version = version
        self.profiles = profiles
        self.records = records
        self.vaccineDoses = vaccineDoses
    }

    private enum CodingKeys: String, CodingKey { case version, profiles, records, vaccineDoses }

    /// profiles 用硬性 decode，v1 舊檔（只有單數的 profile）才會落到 decodeAny 的 v1 分支。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 2
        profiles = try c.decode([ProfileData].self, forKey: .profiles)
        records = try c.decode([RecordData].self, forKey: .records)
        vaccineDoses = try c.decodeIfPresent([VaccineDoseData].self, forKey: .vaccineDoses) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .version)
        try c.encode(profiles, forKey: .profiles)
        try c.encode(records, forKey: .records)
        if !vaccineDoses.isEmpty { try c.encode(vaccineDoses, forKey: .vaccineDoses) }
    }
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
    /// 記錄走 mergeRecords（id 聯集去重、本機優先、依 timestamp 排序）；
    /// 接種紀錄以 key 去重、本機優先、依 key 排序（key = babyId|vaccineId|劑次，
    /// 等同依這三層排序）。
    static func mergeBabies(localProfiles: [ProfileData], localRecords: [RecordData],
                            incomingProfiles: [ProfileData], incomingRecords: [RecordData],
                            localVaccineDoses: [VaccineDoseData] = [],
                            incomingVaccineDoses: [VaccineDoseData] = [])
        -> (profiles: [ProfileData], records: [RecordData], vaccineDoses: [VaccineDoseData]) {
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
        var byKey: [String: VaccineDoseData] = [:]
        for d in incomingVaccineDoses {
            var d = d
            if let mapped = idRemap[d.babyId] { d.babyId = mapped }
            byKey[d.key] = d
        }
        for d in localVaccineDoses { byKey[d.key] = d } // 本機覆蓋 incoming
        let doses = byKey.values.sorted { $0.key < $1.key }
        return (profiles, mergeRecords(local: localRecords, incoming: remapped), doses)
    }
}
