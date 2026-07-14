import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            Text("記錄").tabItem { Label("記錄", systemImage: "square.and.pencil") }
            Text("每日統計").tabItem { Label("統計", systemImage: "list.bullet.rectangle") }
            Text("趨勢").tabItem { Label("趨勢", systemImage: "chart.xyaxis.line") }
            Text("設定").tabItem { Label("設定", systemImage: "gearshape") }
        }
    }
}
