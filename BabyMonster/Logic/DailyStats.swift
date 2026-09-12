import Foundation

struct DailySummary: Equatable {
    var stoolCount: Int
    var urineCount: Int
    var totalFeed: Double
    var averageTemperature: Double?
    var averageWeight: Double?
    var averageHeight: Double?
    var averageHeadCircumference: Double?
}

struct FeedTarget: Equatable {
    /// 當天最少該喝的總奶量（ml）。
    var minimum: Double
    /// 換算用的那筆體重（g）。
    var weight: Double
    /// 那筆體重的記錄時間。
    var timestamp: Date
}

struct DayNote: Identifiable, Equatable {
    let id: UUID
    let timestamp: Date
    let note: String
}

enum DailyStats {
    /// 每天最少該喝的奶量：體重每公斤 100 ml。
    static let minFeedMlPerKg: Double = 100

    static func summary(for date: Date, records: [RecordData], calendar: Calendar = .current) -> DailySummary {
        let dayRecords = records.filter { calendar.isDate($0.timestamp, inSameDayAs: date) }

        let stoolCount = dayRecords.filter { $0.hasStool }.count
        let urineCount = dayRecords.filter { $0.hasUrine }.count
        let totalFeed = dayRecords.compactMap { $0.feedAmount }.reduce(0, +)

        let temps = dayRecords.compactMap { $0.temperature }
        let weights = dayRecords.compactMap { $0.weight }
        let heights = dayRecords.compactMap { $0.height }
        let heads = dayRecords.compactMap { $0.headCircumference }
        let avgTemp = temps.isEmpty ? nil : temps.reduce(0, +) / Double(temps.count)
        let avgWeight = weights.isEmpty ? nil : weights.reduce(0, +) / Double(weights.count)
        let avgHeight = heights.isEmpty ? nil : heights.reduce(0, +) / Double(heights.count)
        let avgHead = heads.isEmpty ? nil : heads.reduce(0, +) / Double(heads.count)

        return DailySummary(stoolCount: stoolCount, urineCount: urineCount,
                            totalFeed: totalFeed, averageTemperature: avgTemp, averageWeight: avgWeight,
                            averageHeight: avgHeight, averageHeadCircumference: avgHead)
    }

    /// 當天最少該喝多少奶，用「最近一次填的體重」換算。
    /// 先取當天結束前最後一筆體重；若那天之前都還沒量過，就退而用第一筆（之後才量的）體重，
    /// 這樣補記體重後，先前那幾天也看得到目標。完全沒有體重記錄時回傳 nil。
    static func feedTarget(for date: Date, records: [RecordData],
                           calendar: Calendar = .current) -> FeedTarget? {
        let weighed = records
            .compactMap { r -> (weight: Double, timestamp: Date)? in
                guard let w = r.weight, w > 0 else { return nil }
                return (w, r.timestamp)
            }
            .sorted { $0.timestamp < $1.timestamp }
        guard let first = weighed.first else { return nil }

        let dayEnd = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date)) ?? date
        let basis = weighed.last { $0.timestamp < dayEnd } ?? first
        // 先乘再除，避免 5100 g 算出 509.999…
        return FeedTarget(minimum: basis.weight * minFeedMlPerKg / 1000,
                          weight: basis.weight, timestamp: basis.timestamp)
    }

    /// 當天有寫備註的記錄，依時間由早到晚，方便回頭讀完整天發生的事。
    static func notes(for date: Date, records: [RecordData],
                      calendar: Calendar = .current) -> [DayNote] {
        records
            .filter { calendar.isDate($0.timestamp, inSameDayAs: date) }
            .compactMap { r in
                guard let n = r.note, !n.isEmpty else { return nil }
                return DayNote(id: r.id, timestamp: r.timestamp, note: n)
            }
            .sorted { $0.timestamp < $1.timestamp }
    }
}
