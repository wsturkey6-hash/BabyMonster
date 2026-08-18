import Foundation

enum TrendMetric: String, CaseIterable, Identifiable {
    case stoolCount, urineCount, totalFeed, avgTemperature, avgWeight
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .stoolCount: return "大便次數"
        case .urineCount: return "小便次數"
        case .totalFeed: return "總喝奶量"
        case .avgTemperature: return "平均體溫"
        case .avgWeight: return "平均體重"
        }
    }
    var unit: String {
        switch self {
        case .stoolCount, .urineCount: return "次"
        case .totalFeed: return "ml"
        case .avgTemperature: return "°C"
        case .avgWeight: return "g"
        }
    }

    /// 次數與總量不會有小數，Y 軸只畫整數刻度；體溫、體重仍要保留小數。
    var isInteger: Bool {
        switch self {
        case .stoolCount, .urineCount, .totalFeed: return true
        case .avgTemperature, .avgWeight: return false
        }
    }
}

struct TrendPoint: Equatable {
    let date: Date
    let value: Double?
}

enum TrendSeries {
    static func series(metric: TrendMetric, days: Int, endingOn: Date,
                       records: [RecordData], calendar: Calendar = .current) -> [TrendPoint] {
        guard days > 0 else { return [] }
        let endDay = calendar.startOfDay(for: endingOn)
        return (0..<days).reversed().map { offset in
            let day = calendar.date(byAdding: .day, value: -offset, to: endDay)!
            let s = DailyStats.summary(for: day, records: records, calendar: calendar)
            let value: Double?
            switch metric {
            case .stoolCount: value = Double(s.stoolCount)
            case .urineCount: value = Double(s.urineCount)
            case .totalFeed: value = s.totalFeed
            case .avgTemperature: value = s.averageTemperature
            case .avgWeight: value = s.averageWeight
            }
            return TrendPoint(date: day, value: value)
        }
    }
}
