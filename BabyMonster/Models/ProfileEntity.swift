import Foundation
import SwiftData

@Model
final class ProfileEntity {
    var id: UUID = UUID()
    var name: String
    var birthDate: Date

    init(id: UUID = UUID(), name: String, birthDate: Date) {
        self.id = id
        self.name = name
        self.birthDate = birthDate
    }

    convenience init(data: ProfileData) {
        self.init(id: data.id, name: data.name, birthDate: data.birthDate)
    }

    var data: ProfileData { ProfileData(id: id, name: name, birthDate: birthDate) }
}
