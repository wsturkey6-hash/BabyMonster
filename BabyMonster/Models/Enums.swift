import Foundation

/// 量的多寡刻度，大便量與小便量共用。rawValue 與網頁版一致。
enum Amount: String, Codable, CaseIterable, Identifiable {
    case few, medium, many
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .few: return "少"
        case .medium: return "中"
        case .many: return "多"
        }
    }
}

enum BristolType: Int, Codable, CaseIterable, Identifiable {
    case type1 = 1, type2, type3, type4, type5, type6, type7
    var id: Int { rawValue }
    var displayName: String {
        switch self {
        case .type1: return "第1型：一顆顆硬塊（難排出）"
        case .type2: return "第2型：香腸狀但結塊"
        case .type3: return "第3型：香腸狀，表面有裂痕"
        case .type4: return "第4型：香腸/蛇狀，光滑柔軟（理想）"
        case .type5: return "第5型：柔軟塊狀，邊緣清楚"
        case .type6: return "第6型：蓬鬆糊狀，邊緣不規則"
        case .type7: return "第7型：水狀，無固體塊（腹瀉）"
        }
    }
}

/// 睡眠以事件記錄：入睡一筆、起床一筆，配對後才算出時長。
enum SleepEvent: String, Codable, CaseIterable, Identifiable {
    case start, end
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .start: return "入睡"
        case .end: return "起床"
        }
    }
    var systemImage: String {
        switch self {
        case .start: return "moon.zzz.fill"
        case .end: return "sun.max.fill"
        }
    }
}
