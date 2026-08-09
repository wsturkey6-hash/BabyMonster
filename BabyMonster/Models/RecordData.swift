import Foundation

struct RecordData: Codable, Identifiable, Equatable {
    var id: UUID
    var timestamp: Date
    var feedAmount: Double?      // ml
    var stoolColor: Int?         // 1...9
    var stoolAmount: Amount?
    var stoolShape: BristolType?
    var hasUrine: Bool
    var urineAmount: Amount?     // 只有 hasUrine 為 true 時才有意義
    var temperature: Double?     // °C
    var weight: Double?          // g
    var note: String?
    var babyId: UUID? = nil      // 所屬寶寶；nil = 遷移前舊資料

    var hasStool: Bool { stoolColor != nil }
}
