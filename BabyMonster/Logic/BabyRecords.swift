import Foundation

/// 依寶寶歸屬篩選記錄（刪除與匯出共用；babyId 為 nil 的記錄一律不屬於任何寶寶）。
enum BabyRecords {
    static func belonging(to babyId: UUID, in records: [RecordData]) -> [RecordData] {
        records.filter { $0.babyId == babyId }
    }

    static func belonging(to babyIds: Set<UUID>, in records: [RecordData]) -> [RecordData] {
        records.filter { $0.babyId.map(babyIds.contains) ?? false }
    }
}
