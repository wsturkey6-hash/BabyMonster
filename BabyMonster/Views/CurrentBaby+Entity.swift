import Foundation
import SwiftData

extension CurrentBaby {
    /// 由 @AppStorage 字串與現有寶寶清單解析出當前寶寶 entity。
    static func entity(in profiles: [ProfileEntity], storedString: String) -> ProfileEntity? {
        let resolved = resolve(storedId: UUID(uuidString: storedString),
                               profileIds: profiles.map { $0.id })
        return profiles.first { $0.id == resolved }
    }
}
