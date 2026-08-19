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

struct DayNote: Identifiable, Equatable {
    let id: UUID
    let timestamp: Date
    let note: String
}

enum DailyStats {
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
