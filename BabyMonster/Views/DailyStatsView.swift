import SwiftUI
import SwiftData

struct DailyStatsView: View {
    @Query private var records: [RecordEntity]
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var date = Date()

    private var currentBaby: ProfileEntity? {
        let resolved = CurrentBaby.resolve(storedId: UUID(uuidString: currentBabyIdString),
                                           profileIds: profiles.map { $0.id })
        return profiles.first { $0.id == resolved }
    }

    private var summary: DailySummary {
        let babyRecords = records.filter { $0.babyId == currentBaby?.id }
        return DailyStats.summary(for: date, records: babyRecords.map { $0.data })
    }

    var body: some View {
        NavigationStack {
            List {
                Section { DatePicker("日期", selection: $date, displayedComponents: .date) }
                Section("當日統計") {
                    statRow("大便次數", "\(summary.stoolCount) 次")
                    statRow("小便次數", "\(summary.urineCount) 次")
                    statRow("總喝奶量", "\(Int(summary.totalFeed)) ml")
                    statRow("平均體溫", summary.averageTemperature.map { String(format: "%.1f °C", $0) } ?? "—")
                    statRow("平均體重", summary.averageWeight.map { "\(Int($0)) g" } ?? "—")
                }
            }
            .navigationTitle("每日統計")
            .toolbar { ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) } }
        }
    }

    private func statRow(_ title: String, _ value: String) -> some View {
        HStack { Text(title); Spacer(); Text(value).bold() }
    }
}
