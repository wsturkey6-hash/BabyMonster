import Foundation

/// 解析「當前寶寶」：存的 id 有效就用它，否則退回第一個寶寶；沒有寶寶回 nil。
enum CurrentBaby {
    static func resolve(storedId: UUID?, profileIds: [UUID]) -> UUID? {
        if let storedId, profileIds.contains(storedId) { return storedId }
        return profileIds.first
    }
}
