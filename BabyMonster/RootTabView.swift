import SwiftUI
import SwiftData

struct RootTabView: View {
    @Environment(\.modelContext) private var context

    var body: some View {
        TabView {
            RecordView().tabItem { Label("記錄", systemImage: "square.and.pencil") }
            DailyStatsView().tabItem { Label("統計", systemImage: "list.bullet.rectangle") }
            TrendView().tabItem { Label("趨勢", systemImage: "chart.xyaxis.line") }
            VaccineView().tabItem { Label("疫苗", systemImage: "syringe") }
            SettingsView().tabItem { Label("設定", systemImage: "gearshape") }
        }
        .task { try? LegacyMigration.run(context: context) }
    }
}
