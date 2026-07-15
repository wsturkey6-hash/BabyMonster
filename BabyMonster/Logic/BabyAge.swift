import Foundation

struct BabyAge: Equatable {
    let years: Int
    let months: Int
    let days: Int
    var displayText: String { "\(years) 歲 \(months) 個月又 \(days) 天" }
}

enum BabyAgeCalculator {
    static func age(birthDate: Date, asOf: Date, calendar: Calendar = .current) -> BabyAge {
        let comps = calendar.dateComponents([.year, .month, .day], from: birthDate, to: asOf)
        return BabyAge(years: max(0, comps.year ?? 0),
                       months: max(0, comps.month ?? 0),
                       days: max(0, comps.day ?? 0))
    }
}
