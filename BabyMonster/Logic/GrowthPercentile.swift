import Foundation

/// 有 WHO 參考標準的三個生長指標。
enum GrowthMetric: String, CaseIterable, Identifiable {
    case weight, height, headCirc
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .weight: return "體重"
        case .height: return "身高"
        case .headCirc: return "頭圍"
        }
    }

    /// WHO 表的單位：體重 kg、身高與頭圍 cm。記錄裡的體重存 g，取用前要換算。
    var unit: String {
        switch self {
        case .weight: return "kg"
        case .height, .headCirc: return "cm"
        }
    }

    /// 顯示時的小數位數。
    var decimals: Int {
        switch self {
        case .weight: return 2
        case .height, .headCirc: return 1
        }
    }
}

struct Lms: Equatable {
    let L: Double
    let M: Double
    let S: Double
}

struct PercentileResult: Equatable {
    let z: Double
    /// 0–100
    let percentile: Double
    /// |Z| > 3 時標記，讓 UI 顯示「< 0.1」／「> 99.9」而不是假精確的數字
    let beyond: Beyond?

    enum Beyond { case low, high }
}

enum GrowthPercentile {
    /// L 幾乎為 0 時改走對數分支，避免 1/L 爆掉。
    private static let lIsZero = 1e-12

    static var dayMax: Int { GrowthReferenceData.dayMax }

    /// 取得某指標／性別在指定年齡（天）的 LMS。超出 0…dayMax 回傳 nil。
    static func lms(metric: GrowthMetric, sex: Sex, ageDays: Int) -> Lms? {
        guard ageDays >= 0, ageDays <= dayMax else { return nil }
        guard let t = GrowthReferenceData.table("\(metric.rawValue)|\(sex.rawValue)") else { return nil }
        return Lms(L: t.L[ageDays], M: t.M[ageDays], S: t.S[ageDays])
    }

    /// 由 Z 分數反推測量值 —— 畫 P3/P15/P50/P85/P97 參考曲線就是用這個。
    static func value(lms: Lms, z: Double) -> Double {
        if abs(lms.L) < lIsZero { return lms.M * exp(lms.S * z) }
        return lms.M * pow(1 + lms.L * lms.S * z, 1 / lms.L)
    }

    /// 由測量值算 Z 分數。
    static func zScore(lms: Lms, value: Double) -> Double {
        if abs(lms.L) < lIsZero { return log(value / lms.M) / lms.S }
        return (pow(value / lms.M, lms.L) - 1) / (lms.L * lms.S)
    }

    /// 標準常態累積分布函數 Φ(z)。
    ///
    /// 直接用 Foundation 內建的 erfc（精度接近機器極限）。網頁版那邊用不完全
    /// Gamma 函數展開實作了同等精度的 erfc，兩者都準到 1e-15 等級，因此必然
    /// 吻合 —— 這比兩平台共用同一個低精度近似式可靠得多。
    static func normalCdf(_ z: Double) -> Double {
        if z.isNaN { return .nan }
        return 0.5 * erfc(-z / 2.0.squareRoot())
    }

    static func result(metric: GrowthMetric, sex: Sex, ageDays: Int, value: Double) -> PercentileResult? {
        guard value.isFinite, value > 0 else { return nil }
        guard let l = lms(metric: metric, sex: sex, ageDays: ageDays) else { return nil }
        let z = zScore(lms: l, value: value)
        guard z.isFinite else { return nil }
        let beyond: PercentileResult.Beyond? = z < -3 ? .low : (z > 3 ? .high : nil)
        return PercentileResult(z: z, percentile: normalCdf(z) * 100, beyond: beyond)
    }

    /// 足歲天數（以日曆日計，不看時分）。
    /// WHO 參考表就是以「天」為索引，所以這是最貼近資料來源的算法。
    /// 測量早於生日時回傳負數，由呼叫端排除。
    static func ageInDays(birthDate: Date, asOf: Date, calendar: Calendar = .current) -> Int {
        let b = calendar.startOfDay(for: birthDate)
        let a = calendar.startOfDay(for: asOf)
        return calendar.dateComponents([.day], from: b, to: a).day ?? 0
    }
}
