import Foundation

/// 疫苗施打紀錄的值型別。key 由寶寶＋疫苗＋劑次組成，同一寶寶的同一劑只會有一筆。
/// key 只存在本機，不寫進備份檔（見 DataTransfer）。
struct VaccineDoseData: Codable, Equatable {
    var babyId: UUID
    var vaccineId: String
    var doseLabel: String
    /// 實際施打日期
    var date: Date

    var key: String { VaccineLog.key(babyId: babyId, vaccineId: vaccineId, doseLabel: doseLabel) }

    private enum CodingKeys: String, CodingKey { case babyId, vaccineId, doseLabel, date }
}

enum VaccineLog {
    static func key(babyId: UUID, vaccineId: String, doseLabel: String) -> String {
        "\(babyId.uuidString)|\(vaccineId)|\(doseLabel)"
    }

    /// key → 施打日期。同 key 重複時後者覆蓋前者。
    static func doneKeys(_ records: [VaccineDoseData]) -> [String: Date] {
        Dictionary(records.map { ($0.key, $0.date) }, uniquingKeysWith: { _, later in later })
    }

    /// 接種日早於今天、又沒有施打紀錄的劑次，依月齡由小到大（同月齡維持疫苗定義順序）。
    static func overdue(birthDate: Date, asOf now: Date, babyId: UUID,
                        done: [String: Date], calendar: Calendar = .current,
                        vaccines: [Vaccine] = Vaccines.all) -> [ScheduledDose] {
        let today = calendar.startOfDay(for: now)
        var out: [ScheduledDose] = []
        for v in vaccines {
            for d in v.doses {
                let due = Vaccines.doseDate(birthDate: birthDate, ageMonths: d.ageMonths,
                                            calendar: calendar)
                if calendar.startOfDay(for: due) >= today { continue }
                if done[key(babyId: babyId, vaccineId: v.id, doseLabel: d.label)] != nil { continue }
                out.append(ScheduledDose(vaccine: v, dose: d))
            }
        }
        // Swift 的 sorted 不保證穩定，用 offset 當同月齡的並列條件（同 Vaccines.milestones 的做法）。
        return out.enumerated()
            .sorted { a, b in
                a.element.dose.ageMonths == b.element.dose.ageMonths
                    ? a.offset < b.offset
                    : a.element.dose.ageMonths < b.element.dose.ageMonths
            }
            .map(\.element)
    }
}
