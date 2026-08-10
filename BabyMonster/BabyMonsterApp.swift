import SwiftUI
import SwiftData

@main
struct BabyMonsterApp: App {
    /// 走 AppModelContainer 的同一份 schema。先前這裡寫死一份 model 清單，
    /// 新增 entity 時只改到 AppModelContainer，正式 App 就不會建那張表。
    private let container: ModelContainer = {
        do { return try AppModelContainer.makePersistent() }
        catch { fatalError("無法建立資料庫：\(error)") }
    }()

    var body: some Scene {
        WindowGroup {
            RootTabView()
        }
        .modelContainer(container)
    }
}
