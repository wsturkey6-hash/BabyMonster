import Foundation
import SwiftData

@Model
final class ProfileEntity {
    var name: String
    var birthDate: Date

    init(name: String, birthDate: Date) {
        self.name = name
        self.birthDate = birthDate
    }

    convenience init(data: ProfileData) {
        self.init(name: data.name, birthDate: data.birthDate)
    }

    var data: ProfileData { ProfileData(name: name, birthDate: birthDate) }
}
