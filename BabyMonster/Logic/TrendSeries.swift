import Foundation

enum TrendMetric: String, CaseIterable, Identifiable {
    case stoolCount, urineCount, totalFeed, avgTemperature, avgWeight, avgHeight, avgHeadCirc
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .stoolCount: return "大便次數"
        case .urineCount: return "小便次數"
        case .totalFeed: return "總喝奶量"
        case .avgTemperature: return "平均體溫"
        case .avgWeight: return "平均體重"
        case .avgHeight: return "平均身高"
        case .avgHeadCirc: return "平均頭圍"
        }
    }
    var unit: String {
        switch self {
        case .stoolCount, .urineCount: return "次"
        case .totalFeed: return "ml"
        case .avgTemperature: return "°C"
        case .avgWeight: return "g"
        case .avgHeight, .avgHeadCirc: return "cm"
        }
    }

    /// 缺值時要不要把前後兩點連起來。
    ///
    /// 體重／身高／頭圍是「狀態量」—— 沒量不代表歸零，中間連起來才看得出成長。
    /// 次數與累計量則相反：那天沒記錄就是沒記錄，連起來會憑空捏造資料。
    /// 體溫雖然也是狀態量，但缺口通常代表「沒發燒所以沒量」，連過去會誤導。
    var connectsGaps: Bool {
        switch self {
        case .avgWeight, .avgHeight, .avgHeadCirc: return true
        case .stoolCount, .urineCount, .totalFeed, .avgTemperature: return false
        }
    }

    /// 次數與總量不會有小數，Y 軸只畫整數刻度；體溫、體重仍要保留小數。
    var isInteger: Bool {
        switch self {
        case .stoolCount, .urineCount, .totalFeed: return true
        // 身高、頭圍以 0.1 cm 為單位記錄，跟體溫體重一樣要保留小數
        case .avgTemperature, .avgWeight, .avgHeight, .avgHeadCirc: return false
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
            case .avgHeight: value = s.averageHeight
            case .avgHeadCirc: value = s.averageHeadCircumference
            }
            return TrendPoint(date: day, value: value)
        }
    }
}
