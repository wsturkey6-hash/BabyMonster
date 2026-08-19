import Foundation
import SwiftData

@Model
final class ProfileEntity: Identifiable {
    var id: UUID = UUID()
    var name: String
    var birthDate: Date
    /// 選填性別；optional 新欄位走 SwiftData 輕量遷移。
    var sexRaw: String?

    init(id: UUID = UUID(), name: String, birthDate: Date, sexRaw: String? = nil) {
        self.id = id
        self.name = name
        self.birthDate = birthDate
        self.sexRaw = sexRaw
    }

    convenience init(data: ProfileData) {
        self.init(id: data.id, name: data.name, birthDate: data.birthDate,
                  sexRaw: data.sex?.rawValue)
    }

    var sex: Sex? {
        get { sexRaw.flatMap(Sex.init(rawValue:)) }
        set { sexRaw = newValue?.rawValue }
    }

    var data: ProfileData {
        ProfileData(id: id, name: name, birthDate: birthDate, sex: sex)
    }
}
