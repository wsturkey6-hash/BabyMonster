import Foundation

struct ProfileData: Codable, Equatable {
    var id: UUID
    var name: String
    var birthDate: Date

    init(id: UUID = UUID(), name: String, birthDate: Date) {
        self.id = id
        self.name = name
        self.birthDate = birthDate
    }

    private enum CodingKeys: String, CodingKey { case id, name, birthDate }

    /// v1 舊檔沒有 id → 解碼時自動補一個新 UUID。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decode(String.self, forKey: .name)
        birthDate = try c.decode(Date.self, forKey: .birthDate)
    }
}
