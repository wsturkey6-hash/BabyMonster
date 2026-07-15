import Foundation

struct DailySummary: Equatable {
    var stoolCount: Int
    var urineCount: Int
    var totalFeed: Double
    var averageTemperature: Double?
    var averageWeight: Double?
}

enum DailyStats {
    static func summary(for date: Date, records: [RecordData], calendar: Calendar = .current) -> DailySummary {
        let dayRecords = records.filter { calendar.isDate($0.timestamp, inSameDayAs: date) }

        let stoolCount = dayRecords.filter { $0.hasStool }.count
        let urineCount = dayRecords.filter { $0.hasUrine }.count
        let totalFeed = dayRecords.compactMap { $0.feedAmount }.reduce(0, +)

        let temps = dayRecords.compactMap { $0.temperature }
        let weights = dayRecords.compactMap { $0.weight }
        let avgTemp = temps.isEmpty ? nil : temps.reduce(0, +) / Double(temps.count)
        let avgWeight = weights.isEmpty ? nil : weights.reduce(0, +) / Double(weights.count)

        return DailySummary(stoolCount: stoolCount, urineCount: urineCount,
                            totalFeed: totalFeed, averageTemperature: avgTemp, averageWeight: avgWeight)
    }
}
