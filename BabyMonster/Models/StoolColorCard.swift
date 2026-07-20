import SwiftUI

enum StoolColorCard {
    static let all: [Int] = Array(1...9)

    /// 台灣兒童健康手冊嬰兒大便卡：1–6 號為異常（白陶土色系），7–9 號正常。
    static func isAbnormal(_ number: Int) -> Bool {
        (1...6).contains(number)
    }

    /// 近似色，依實體大便卡照片取樣（實體卡為最終判讀依據）。與 web 版 stoolColorCard.ts 同步。
    static func color(for number: Int) -> Color {
        switch number {
        case 1: return Color(red: 0.94, green: 0.91, blue: 0.82) // 淡奶油白 #f0e8d1
        case 2: return Color(red: 0.92, green: 0.87, blue: 0.78) // 淺米灰 #eaddc8
        case 3: return Color(red: 0.96, green: 0.89, blue: 0.74) // 奶油黃 #f4e4bd
        case 4: return Color(red: 0.93, green: 0.89, blue: 0.54) // 淺亮黃 #ece289
        case 5: return Color(red: 0.91, green: 0.82, blue: 0.63) // 淺卡其 #e9d2a0
        case 6: return Color(red: 0.95, green: 0.89, blue: 0.83) // 淡粉白 #f1e3d3
        case 7: return Color(red: 0.95, green: 0.77, blue: 0.18) // 金黃 #f3c42d
        case 8: return Color(red: 0.91, green: 0.63, blue: 0.11) // 橘黃 #e8a01d
        case 9: return Color(red: 0.65, green: 0.64, blue: 0.20) // 黃綠 #a5a233
        default: return .gray
        }
    }

    static func label(for number: Int) -> String {
        isAbnormal(number) ? "\(number) 號（異常）" : "\(number) 號（正常）"
    }

    /// 實卡九色皆為中亮色，黑字對比全數足夠。
    static func textColor(for number: Int) -> Color {
        .black
    }
}
