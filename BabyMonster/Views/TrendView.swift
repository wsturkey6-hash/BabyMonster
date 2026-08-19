import SwiftUI
import SwiftData
import Charts

struct TrendView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case daily, growth
        var id: String { rawValue }
        var displayName: String {
            switch self {
            case .daily: return "日常趨勢"
            case .growth: return "生長曲線"
            }
        }
    }

    @Query private var records: [RecordEntity]
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var mode: Mode = .daily
    @State private var metric: TrendMetric = .totalFeed
    @State private var growthMetric: GrowthMetric = .weight
    @State private var days = 7
    @State private var customDays = 7

    private let presets = [7, 14, 30]

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    private var babyRecords: [RecordData] {
        records.filter { $0.babyId == currentBaby?.id }.map { $0.data }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("看什麼", selection: $mode) {
                        ForEach(Mode.allCases) { Text($0.displayName).tag($0) }
                    }.pickerStyle(.segmented)
                }

                switch mode {
                case .daily: dailySections
                case .growth: growthSections
                }
            }
            .navigationTitle("趨勢")
            .toolbar { ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) } }
        }
    }

    // MARK: - 日常趨勢

    private var effectiveDays: Int { days == -1 ? customDays : days }

    @ViewBuilder
    private var dailySections: some View {
        Section("指標") {
            Picker("指標", selection: $metric) {
                ForEach(TrendMetric.allCases) { Text($0.displayName).tag($0) }
            }.pickerStyle(.menu)
            if metric.connectsGaps {
                Text("身高、頭圍這類不是天天量的指標，沒記錄的日子會直接連過去，才看得出成長走勢。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
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
            dailyChart.frame(height: 260)
        }
    }

    /// 不連接缺口的指標，用「連續有值的區段」各自成一條 series，讓線在缺口處真的斷開。
    /// （Swift Charts 只要略過 nil 點就會自動連過去，所以得主動分段。）
    private func segments(_ points: [TrendPoint]) -> [(index: Int, points: [(Date, Double)])] {
        var out: [(Int, [(Date, Double)])] = []
        var current: [(Date, Double)] = []
        for p in points {
            if let v = p.value {
                current.append((p.date, v))
            } else if !current.isEmpty {
                out.append((out.count, current)); current = []
            }
        }
        if !current.isEmpty { out.append((out.count, current)) }
        return out
    }

    private var dailyChart: some View {
        let points = TrendSeries.series(metric: metric, days: effectiveDays,
                                        endingOn: Date(), records: babyRecords)
        return Chart {
            if metric.connectsGaps {
                ForEach(points.compactMap { p in p.value.map { (p.date, $0) } }, id: \.0) { item in
                    LineMark(x: .value("日期", item.0, unit: .day),
                             y: .value(metric.displayName, item.1))
                    PointMark(x: .value("日期", item.0, unit: .day),
                              y: .value(metric.displayName, item.1))
                }
            } else {
                ForEach(segments(points), id: \.index) { seg in
                    ForEach(seg.points, id: \.0) { item in
                        LineMark(x: .value("日期", item.0, unit: .day),
                                 y: .value(metric.displayName, item.1),
                                 series: .value("段", seg.index))
                        PointMark(x: .value("日期", item.0, unit: .day),
                                  y: .value(metric.displayName, item.1))
                    }
                }
            }
        }
        .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisGridLine(); AxisTick() } }
        .chartYAxis {
            AxisMarks { value in
                let v = value.as(Double.self) ?? 0
                if !metric.isInteger || v == v.rounded() {
                    AxisGridLine()
                    AxisTick()
                    AxisValueLabel()
                }
            }
        }
    }

    // MARK: - 生長曲線

    @ViewBuilder
    private var growthSections: some View {
        if let baby = currentBaby {
            let profile = baby.data
            if profile.sex == nil {
                Section("生長曲線") {
                    Text("生長曲線的參考標準男女不同，要先設定寶寶的性別才算得出百分位。請到「設定 → 點寶寶的名字」選擇男寶寶或女寶寶。")
                        .font(.footnote).foregroundStyle(.secondary)
                    ForEach(GrowthMetric.allCases) { m in
                        if let latest = GrowthChart.latest(metric: m, profile: profile, records: babyRecords) {
                            LabeledContent(m.displayName,
                                           value: String(format: "%.\(m.decimals)f %@", latest.value, m.unit))
                        }
                    }
                }
            } else if GrowthPercentile.ageInDays(birthDate: profile.birthDate, asOf: Date()) > GrowthPercentile.dayMax {
                Section("生長曲線") {
                    Text("WHO 兒童生長標準到 5 歲為止，\(profile.name) 已經超過這個範圍了。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                growthContent(profile: profile)
            }
        } else {
            Section("生長曲線") {
                Text("還沒有寶寶資料，先到記錄頁存一筆記錄就會自動建立。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func growthContent(profile: ProfileData) -> some View {
        let latests = GrowthMetric.allCases.map {
            ($0, GrowthChart.latest(metric: $0, profile: profile, records: babyRecords))
        }

        Section("目前落點") {
            if latests.allSatisfy({ $0.1 == nil }) {
                Text("還沒有身高、體重或頭圍的記錄。到記錄頁填一筆，這裡就會算出百分位。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(latests, id: \.0) { m, latest in
                VStack(alignment: .leading, spacing: 2) {
                    if let latest {
                        HStack {
                            Text(m.displayName).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text(String(format: "%.\(m.decimals)f %@", latest.value, m.unit))
                        }
                        if let r = latest.result {
                            Text("第 \(GrowthChart.formatPercentile(r)) 百分位・\(GrowthChart.bandLabel(r))")
                                .font(.footnote).foregroundStyle(.secondary)
                        } else {
                            Text("超出 WHO 年齡範圍").font(.footnote).foregroundStyle(.secondary)
                        }
                        Text("\(latest.date.formatted(date: .numeric, time: .omitted)) 量")
                            .font(.caption2).foregroundStyle(.tertiary)
                    } else {
                        HStack {
                            Text(m.displayName).font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("還沒有記錄").foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Text("百分位是跟同年齡、同性別的寶寶比較。落在哪一段都可能是正常的，重點是沿著自己的曲線穩定成長；若短時間內明顯偏離，再請教醫師。")
                .font(.footnote).foregroundStyle(.secondary)
        }

        Section("看哪個指標") {
            Picker("指標", selection: $growthMetric) {
                ForEach(GrowthMetric.allCases) { Text($0.displayName).tag($0) }
            }.pickerStyle(.segmented)
        }

        Section("\(growthMetric.displayName)生長曲線（\(growthMetric.unit)）") {
            growthChart(profile: profile).frame(height: 300)
            Text(growthCaption(profile: profile))
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func growthCaption(profile: ProfileData) -> String {
        var s = "灰色虛線由外而內是第 3、15、85、97 百分位，中間實線是第 50 百分位（中位數）；橘線是 \(profile.name)。"
        if growthMetric == .height {
            s += " 滿 2 歲時參考線會有一個小落差，那是 WHO 從躺著量身長改成站著量身高造成的，不是資料錯誤。"
        }
        return s
    }

    @ViewBuilder
    private func growthChart(profile: ProfileData) -> some View {
        let series = GrowthChart.series(metric: growthMetric, profile: profile, records: babyRecords)
        let ageNow = max(0, GrowthPercentile.ageInDays(birthDate: profile.birthDate, asOf: Date()))
        let anchor = max(series.last?.ageDays ?? 0, ageNow)
        let maxMonths = GrowthChart.chartMaxMonths(ageDays: anchor)
        let maxDays = min(GrowthChart.monthsToDays(maxMonths), GrowthPercentile.dayMax)
        let curves = profile.sex.map {
            GrowthChart.referenceCurves(metric: growthMetric, sex: $0, maxDays: maxDays)
        } ?? []

        Chart {
            ForEach(curves) { curve in
                ForEach(curve.points) { p in
                    LineMark(x: .value("月齡", p.months),
                             y: .value(growthMetric.displayName, p.value),
                             series: .value("線", "P\(curve.percentile)"))
                }
                .foregroundStyle(curve.percentile == 50 ? Color.brown : Color.gray.opacity(0.55))
                .lineStyle(StrokeStyle(lineWidth: curve.percentile == 50 ? 1.6 : 1,
                                       dash: curve.percentile == 50 ? [] : [4, 3]))
            }
            ForEach(series) { p in
                LineMark(x: .value("月齡", p.months),
                         y: .value(growthMetric.displayName, p.value),
                         series: .value("線", "baby"))
                .foregroundStyle(Color.orange)
                .lineStyle(StrokeStyle(lineWidth: 2.5))
                PointMark(x: .value("月齡", p.months),
                          y: .value(growthMetric.displayName, p.value))
                .foregroundStyle(Color.orange)
            }
        }
        .chartXScale(domain: 0...Double(maxMonths))
        .chartXAxisLabel("月齡")
    }
}
