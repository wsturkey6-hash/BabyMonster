import Foundation

struct GrowthPoint: Equatable, Identifiable {
    let ageDays: Int
    let value: Double
    var id: Int { ageDays }
    var months: Double { GrowthChart.daysToMonths(ageDays) }
}

struct LatestMeasurement: Equatable {
    let metric: GrowthMetric
    let value: Double
    let ageDays: Int
    let date: Date
    /// 沒設性別或年齡超出 WHO 範圍時為 nil —— 值還是要顯示，只是算不出百分位
    let result: PercentileResult?
}

struct ReferenceCurve: Equatable, Identifiable {
    let percentile: Int
    let points: [GrowthPoint]
    var id: Int { percentile }
}

enum GrowthChart {
    /// 平均一個月的天數（WHO 自己也用這個數字換算月齡）。
    static let daysPerMonth = 30.4375

    /// 兒童健康手冊上的五條參考線。z 值由測試釘住，確保與百分位相符。
    static let referenceBands: [(percentile: Int, z: Double)] = [
        (3, -1.8807936081512509),
        (15, -1.0364333894937894),
        (50, 0),
        (85, 1.0364333894937894),
        (97, 1.8807936081512504),
    ]

    /// X 軸上限的候選級距，避免寶寶還小時資料全擠在圖的最左邊。
    static let chartMonthSteps = [3, 6, 12, 24, 36, 60]

    /// 目標取樣點數；圖寬有限，再多也看不出差別。
    private static let targetSamples = 100

    static func daysToMonths(_ days: Int) -> Double { Double(days) / daysPerMonth }

    static func monthsToDays(_ months: Int) -> Int { Int((Double(months) * daysPerMonth).rounded()) }

    static func chartMaxMonths(ageDays: Int) -> Int {
        let months = daysToMonths(max(0, ageDays))
        return chartMonthSteps.first { Double($0) >= months } ?? chartMonthSteps[chartMonthSteps.count - 1]
    }

    /// 取出記錄裡對應該指標的值，並換算成 WHO 表的單位（體重 g → kg）。
    static func metricValue(_ metric: GrowthMetric, _ r: RecordData) -> Double? {
        switch metric {
        case .weight: return r.weight.map { $0 / 1000 }
        case .height: return r.height
        case .headCirc: return r.headCircumference
        }
    }

    /// 該指標最新的一筆測量。
    /// 三個指標各自取自己最新的記錄，因為身高體重常不是同一天量的。
    static func latest(metric: GrowthMetric, profile: ProfileData, records: [RecordData],
                       calendar: Calendar = .current) -> LatestMeasurement? {
        var best: (r: RecordData, value: Double, ageDays: Int)?
        for r in records {
            guard let value = metricValue(metric, r), value.isFinite, value > 0 else { continue }
            let days = GrowthPercentile.ageInDays(birthDate: profile.birthDate, asOf: r.timestamp,
                                                  calendar: calendar)
            guard days >= 0 else { continue } // 早於生日的記錄不列入
            if best == nil || r.timestamp > best!.r.timestamp {
                best = (r, value, days)
            }
        }
        guard let best else { return nil }

        var result: PercentileResult?
        if let sex = profile.sex, best.ageDays <= GrowthPercentile.dayMax {
            result = GrowthPercentile.result(metric: metric, sex: sex,
                                             ageDays: best.ageDays, value: best.value)
        }
        return LatestMeasurement(metric: metric, value: best.value, ageDays: best.ageDays,
                                 date: best.r.timestamp, result: result)
    }

    /// 歷次測量點，依年齡由小到大；超出 WHO 年齡範圍的點不畫。
    /// 同一天量多次時取平均，與統計頁的慣例一致。
    static func series(metric: GrowthMetric, profile: ProfileData, records: [RecordData],
                       calendar: Calendar = .current) -> [GrowthPoint] {
        var byDay: [Int: [Double]] = [:]
        for r in records {
            guard let value = metricValue(metric, r), value.isFinite, value > 0 else { continue }
            let days = GrowthPercentile.ageInDays(birthDate: profile.birthDate, asOf: r.timestamp,
                                                  calendar: calendar)
            guard days >= 0, days <= GrowthPercentile.dayMax else { continue }
            byDay[days, default: []].append(value)
        }
        return byDay.keys.sorted().map { day in
            let vs = byDay[day]!
            return GrowthPoint(ageDays: day, value: vs.reduce(0, +) / Double(vs.count))
        }
    }

    /// 產生 X 軸 0…maxDays 的五條參考曲線。
    ///
    /// 取樣點一定包含 day 730 與 731 —— WHO 在滿 2 歲從躺姿身長改成站姿身高，
    /// 中位數在那裡陡降 0.67cm，取樣時跳過會把那個轉折抹平。
    static func referenceCurves(metric: GrowthMetric, sex: Sex, maxDays: Int) -> [ReferenceCurve] {
        let end = max(0, min(maxDays, GrowthPercentile.dayMax))
        let step = max(1, Int((Double(end) / Double(targetSamples)).rounded(.up)))

        var days = Set<Int>([0, end])
        var d = 0
        while d <= end { days.insert(d); d += step }
        if end >= 731 { days.insert(730); days.insert(731) }
        let sampled = days.sorted()

        return referenceBands.map { band in
            ReferenceCurve(
                percentile: band.percentile,
                points: sampled.compactMap { day in
                    guard let l = GrowthPercentile.lms(metric: metric, sex: sex, ageDays: day) else { return nil }
                    return GrowthPoint(ageDays: day, value: GrowthPercentile.value(lms: l, z: band.z))
                }
            )
        }
    }

    // MARK: - 顯示格式

    static func formatPercentile(_ r: PercentileResult) -> String {
        switch r.beyond {
        case .low: return "< 0.1"
        case .high: return "> 99.9"
        case .none:
            if r.percentile < 1 || r.percentile > 99 { return String(format: "%.1f", r.percentile) }
            return String(Int(r.percentile.rounded()))
        }
    }

    /// 中性描述，不下判斷 —— 百分位本來就是同齡比較，落在哪裡都可能正常。
    static func bandLabel(_ r: PercentileResult) -> String {
        if r.percentile < 3 { return "低於第 3 百分位" }
        if r.percentile > 97 { return "高於第 97 百分位" }
        if r.percentile < 15 { return "第 3–15 百分位" }
        if r.percentile > 85 { return "第 85–97 百分位" }
        return "第 15–85 百分位（中段）"
    }
}
