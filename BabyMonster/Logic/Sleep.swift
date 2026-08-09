import Foundation

struct SleepInterval: Equatable {
    var start: Date
    var end: Date
}

enum Sleep {
    /// 依時間由早到晚配對入睡／起床。
    /// 已經有一段開著時的重複「入睡」會被忽略（以最早那次為準）；
    /// 沒有對應入睡的「起床」也忽略；最後還開著的那段（還在睡或忘了記）不產生區間。
    static func intervals(records: [RecordData]) -> [SleepInterval] {
        let events = records
            .filter { $0.sleep != nil }
            .sorted { $0.timestamp < $1.timestamp }

        var result: [SleepInterval] = []
        var openStart: Date?

        for e in events {
            if e.sleep == .start {
                if openStart == nil { openStart = e.timestamp }
            } else if let s = openStart {
                result.append(SleepInterval(start: s, end: e.timestamp))
                openStart = nil
            }
        }
        return result
    }

    /// 選定當天 [00:00, 隔天 00:00) 與各段睡眠的重疊分鐘數總和（跨夜以午夜切分）。
    static func dailyMinutes(for date: Date, records: [RecordData],
                             calendar: Calendar = .current) -> Int {
        let dayStart = calendar.startOfDay(for: date)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return 0 }

        let seconds = intervals(records: records).reduce(0.0) { sum, s in
            let from = max(s.start, dayStart)
            let to = min(s.end, dayEnd)
            return sum + max(0, to.timeIntervalSince(from))
        }
        return Int((seconds / 60).rounded())
    }
}
