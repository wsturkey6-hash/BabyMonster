import SwiftUI

enum StoolColorCard {
    static let all: [Int] = Array(1...9)

    /// 台灣兒童健康手冊嬰兒大便卡：1–6 號為異常（白陶土色系），7–9 號正常。
    static func isAbnormal(_ number: Int) -> Bool {
        (1...6).contains(number)
    }

    /// 近似色（實體大便卡為最終判讀依據）。
    static func color(for number: Int) -> Color {
        switch number {
        case 1: return Color(red: 0.90, green: 0.88, blue: 0.80) // 灰白/陶土
        case 2: return Color(red: 0.92, green: 0.90, blue: 0.78) // 淺灰黃
        case 3: return Color(red: 0.95, green: 0.93, blue: 0.75) // 淺黃白
        case 4: return Color(red: 0.96, green: 0.90, blue: 0.60) // 淡黃
        case 5: return Color(red: 0.85, green: 0.86, blue: 0.55) // 淺黃綠
        case 6: return Color(red: 0.70, green: 0.80, blue: 0.55) // 淡綠
        case 7: return Color(red: 0.90, green: 0.70, blue: 0.25) // 黃
        case 8: return Color(red: 0.45, green: 0.55, blue: 0.25) // 綠
        case 9: return Color(red: 0.45, green: 0.30, blue: 0.15) // 棕褐
        default: return .gray
        }
    }

    static func label(for number: Int) -> String {
        isAbnormal(number) ? "\(number) 號（異常）" : "\(number) 號（正常）"
    }
}
