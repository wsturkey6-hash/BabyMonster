import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            RecordView().tabItem { Label("記錄", systemImage: "square.and.pencil") }
            DailyStatsView().tabItem { Label("統計", systemImage: "list.bullet.rectangle") }
            TrendView().tabItem { Label("趨勢", systemImage: "chart.xyaxis.line") }
            Text("設定").tabItem { Label("設定", systemImage: "gearshape") }
        }
    }
}
