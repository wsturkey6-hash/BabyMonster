import Foundation
import SwiftData

@Model
final class RecordEntity {
    @Attribute(.unique) var id: UUID
    var timestamp: Date
    var feedAmount: Double?
    var stoolColor: Int?
    var stoolAmountRaw: String?
    var stoolShapeRaw: Int?
    var hasUrine: Bool
    var temperature: Double?
    var weight: Double?
    var note: String?
    var babyId: UUID?

    init(id: UUID, timestamp: Date, feedAmount: Double?, stoolColor: Int?,
         stoolAmountRaw: String?, stoolShapeRaw: Int?, hasUrine: Bool,
         temperature: Double?, weight: Double?, note: String?, babyId: UUID? = nil) {
        self.id = id; self.timestamp = timestamp; self.feedAmount = feedAmount
        self.stoolColor = stoolColor; self.stoolAmountRaw = stoolAmountRaw; self.stoolShapeRaw = stoolShapeRaw
        self.hasUrine = hasUrine; self.temperature = temperature; self.weight = weight; self.note = note
        self.babyId = babyId
    }

    convenience init(data: RecordData) {
        self.init(id: data.id, timestamp: data.timestamp, feedAmount: data.feedAmount,
                  stoolColor: data.stoolColor, stoolAmountRaw: data.stoolAmount?.rawValue,
                  stoolShapeRaw: data.stoolShape?.rawValue, hasUrine: data.hasUrine,
                  temperature: data.temperature, weight: data.weight, note: data.note,
                  babyId: data.babyId)
    }

    func apply(_ data: RecordData) {
        timestamp = data.timestamp; feedAmount = data.feedAmount; stoolColor = data.stoolColor
        stoolAmountRaw = data.stoolAmount?.rawValue; stoolShapeRaw = data.stoolShape?.rawValue
        hasUrine = data.hasUrine; temperature = data.temperature; weight = data.weight; note = data.note
        babyId = data.babyId
    }

    var data: RecordData {
        RecordData(id: id, timestamp: timestamp, feedAmount: feedAmount, stoolColor: stoolColor,
                   stoolAmount: stoolAmountRaw.flatMap(StoolAmount.init(rawValue:)),
                   stoolShape: stoolShapeRaw.flatMap(BristolType.init(rawValue:)),
                   hasUrine: hasUrine, temperature: temperature, weight: weight, note: note,
                   babyId: babyId)
    }
}
