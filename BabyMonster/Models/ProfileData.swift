import Foundation

struct ProfileData: Codable, Equatable {
    var id: UUID
    var name: String
    var birthDate: Date
    /// 選填；只有生長曲線會用到。舊檔沒有這個欄位。
    var sex: Sex?

    init(id: UUID = UUID(), name: String, birthDate: Date, sex: Sex? = nil) {
        self.id = id
        self.name = name
        self.birthDate = birthDate
        self.sex = sex
    }

    private enum CodingKeys: String, CodingKey { case id, name, birthDate, sex }

    /// v1 舊檔沒有 id → 解碼時自動補一個新 UUID。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decode(String.self, forKey: .name)
        birthDate = try c.decode(Date.self, forKey: .birthDate)
        sex = try c.decodeIfPresent(Sex.self, forKey: .sex)
    }
}
