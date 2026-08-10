import Foundation
import SwiftData

/// 一劑疫苗的施打紀錄。key = babyId|vaccineId|劑次，同一寶寶的同一劑只會有一筆。
@Model
final class VaccineDoseEntity {
    @Attribute(.unique) var key: String
    var babyId: UUID
    var vaccineId: String
    var doseLabel: String
    var date: Date

    init(key: String, babyId: UUID, vaccineId: String, doseLabel: String, date: Date) {
        self.key = key
        self.babyId = babyId
        self.vaccineId = vaccineId
        self.doseLabel = doseLabel
        self.date = date
    }

    convenience init(data: VaccineDoseData) {
        self.init(key: data.key, babyId: data.babyId, vaccineId: data.vaccineId,
                  doseLabel: data.doseLabel, date: data.date)
    }

    var data: VaccineDoseData {
        VaccineDoseData(babyId: babyId, vaccineId: vaccineId, doseLabel: doseLabel, date: date)
    }
}
