import SwiftUI
import SwiftData
import Charts

struct TrendView: View {
    @Query private var records: [RecordEntity]
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var metric: TrendMetric = .totalFeed
    @State private var days = 7
    @State private var customDays = 7

    private let presets = [7, 14, 30]

    private var currentBaby: ProfileEntity? {
        let resolved = CurrentBaby.resolve(storedId: UUID(uuidString: currentBabyIdString),
                                           profileIds: profiles.map { $0.id })
        return profiles.first { $0.id == resolved }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("指標") {
                    Picker("指標", selection: $metric) {
                        ForEach(TrendMetric.allCases) { Text($0.displayName).tag($0) }
                    }.pickerStyle(.menu)
                }
                Section("天數") {
                    Picker("天數", selection: $days) {
                        ForEach(presets, id: \.self) { Text("\($0) 天").tag($0) }
                        Text("自訂").tag(-1)
                    }.pickerStyle(.segmented)
                    if days == -1 {
                        Stepper("自訂：\(customDays) 天", value: $customDays, in: 2...180)
                    }
                }
                Section("\(metric.displayName)（\(metric.unit)）") {
                    chart.frame(height: 260)
                }
            }
            .navigationTitle("趨勢")
            .toolbar { ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) } }
        }
    }

    private var effectiveDays: Int { days == -1 ? customDays : days }

    private var chart: some View {
        Chart(TrendSeries.series(metric: metric, days: effectiveDays, endingOn: Date(),
                                 records: records.filter { $0.babyId == currentBaby?.id }.map { $0.data }), id: \.date) { point in
            if let v = point.value {
                LineMark(x: .value("日期", point.date, unit: .day), y: .value(metric.displayName, v))
                PointMark(x: .value("日期", point.date, unit: .day), y: .value(metric.displayName, v))
            }
        }
        .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisGridLine(); AxisTick() } }
    }
}
