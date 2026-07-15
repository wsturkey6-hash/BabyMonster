import SwiftUI
import SwiftData

@main
struct BabyMonsterApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(for: [RecordEntity.self, ProfileEntity.self])
    }
}
