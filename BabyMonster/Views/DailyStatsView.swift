import SwiftUI
import SwiftData

struct DailyStatsView: View {
    @Query private var records: [RecordEntity]
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var date = Date()

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    private var babyRecords: [RecordData] {
        records.filter { $0.babyId == currentBaby?.id }.map { $0.data }
    }

    private var summary: DailySummary {
        DailyStats.summary(for: date, records: babyRecords)
    }

    private var sleepMinutes: Int {
        Sleep.dailyMinutes(for: date, records: babyRecords)
    }

    private var notes: [DayNote] {
        DailyStats.notes(for: date, records: babyRecords)
    }

    /// 90 分 →「1 小時 30 分」；未滿一小時只顯示分鐘。
    private func sleepText(_ minutes: Int) -> String {
        if minutes == 0 { return "—" }
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m) 分" }
        return m == 0 ? "\(h) 小時" : "\(h) 小時 \(m) 分"
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
                    statRow("睡眠時間", sleepText(sleepMinutes))
                }

                Section("當日備註") {
                    if notes.isEmpty {
                        Text("這天沒有寫備註。").foregroundStyle(.secondary)
                    }
                    ForEach(notes) { n in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(n.timestamp, format: .dateTime.hour().minute())
                                .font(.caption).foregroundStyle(.secondary)
                            Text(n.note)
                        }
                    }
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
