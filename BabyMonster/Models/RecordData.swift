import Foundation

struct RecordData: Codable, Identifiable, Equatable {
    var id: UUID
    var timestamp: Date
    var feedAmount: Double?      // ml
    var stoolColor: Int?         // 1...9
    var stoolAmount: StoolAmount?
    var stoolShape: BristolType?
    var hasUrine: Bool
    var temperature: Double?     // °C
    var weight: Double?          // g
    var note: String?

    var hasStool: Bool { stoolColor != nil }
}
