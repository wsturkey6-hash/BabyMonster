import Foundation
import SwiftData

/// v1 → v2 一次性資料歸屬：把沒有 babyId 的舊記錄歸給第一個寶寶。冪等。
enum LegacyMigration {
    @MainActor
    static func run(context: ModelContext) throws {
        // 1. 寶寶 id 去重（防輕量遷移為既有多列填入相同預設值）
        let profiles = try context.fetch(
            FetchDescriptor<ProfileEntity>(sortBy: [SortDescriptor(\.birthDate)]))
        var seen = Set<UUID>()
        for p in profiles {
            if seen.contains(p.id) { p.id = UUID() }
            seen.insert(p.id)
        }

        // 2. 歸屬 nil-babyId 記錄
        let orphans = try context.fetch(FetchDescriptor<RecordEntity>())
            .filter { $0.babyId == nil }
        if orphans.isEmpty { try context.save(); return }

        let owner: ProfileEntity
        if let first = profiles.first {
            owner = first
        } else {
            owner = ProfileEntity(name: "BabyMonster",
                                  birthDate: Calendar.current.startOfDay(for: Date()))
            context.insert(owner)
        }
        for r in orphans { r.babyId = owner.id }
        try context.save()
    }
}
