import Foundation

/// 兒童預防接種時程。
///
/// 公費：衛生福利部疾病管制署「現行兒童預防接種時程表（兒童常規疫苗）」11401 版（114 年 1 月）
///       https://www.cdc.gov.tw/Category/Page/TxRW-x3WzvPhvEtxM628GA
/// 自費：SIMBA「新生兒疫苗接種時程表（公費＋自費）」2026.03 版
///       https://shop.simba.com.tw/Article/Detail/104741
/// 兩份資料的公費欄位互相核對過，月齡與劑次一致。
///
/// 公費與自費掛在「劑次」而不是「疫苗」上：水痘第一劑公費、第二劑自費。
/// 時程會不定期調整，更新時請一併更新 sourceNotePublic / sourceNoteSelf。
enum Funding: String, Codable {
    case publicFunded = "public"
    case selfPaid = "self"

    var displayName: String {
        switch self {
        case .publicFunded: return "公費"
        case .selfPaid: return "自費"
        }
    }
}

struct VaccineDose: Identifiable, Equatable {
    let label: String       // 第一劑 / 一劑
    let ageMonths: Int      // 0 代表出生 24 小時內
    let funding: Funding
    var id: String { "\(label)-\(ageMonths)" }
}

struct Vaccine: Identifiable, Equatable {
    let id: String
    let name: String
    let en: String
    let description: String
    let doses: [VaccineDose]
    var recurring: String? = nil
    var note: String? = nil
}

struct ScheduledDose: Identifiable, Equatable {
    let vaccine: Vaccine
    let dose: VaccineDose
    var id: String { "\(vaccine.id)-\(dose.id)" }
}

struct Milestone: Identifiable, Equatable {
    let ageMonths: Int
    let doses: [ScheduledDose]
    var note: String? = nil
    var id: Int { ageMonths }
}

enum Vaccines {
    static let sourceNotePublic = "疾管署 11401 版（114 年 1 月）"
    static let sourceNoteSelf = "SIMBA 新生兒疫苗接種時程表 2026.03 版"

    /// 滿 5 歲至入國小前，時程表最後一格。
    private static let preschool = 60

    private static func pub(_ label: String, _ m: Int) -> VaccineDose {
        VaccineDose(label: label, ageMonths: m, funding: .publicFunded)
    }
    private static func slf(_ label: String, _ m: Int) -> VaccineDose {
        VaccineDose(label: label, ageMonths: m, funding: .selfPaid)
    }

    /// 同一次回診要打的疫苗彼此需要間隔時，註記在該月齡上。
    private static let milestoneNotes: [Int: String] = [
        12: "水痘第一劑與 13 價結合型肺炎鏈球菌第三劑需間隔兩週"
    ]

    static let all: [Vaccine] = [
        Vaccine(id: "hepb", name: "B型肝炎疫苗", en: "Hepatitis B",
                description: "預防B型肝炎病毒感染。台灣曾是B肝高盛行地區，新生兒按時接種能大幅降低變成帶原者的機會。帶原者成年後發生肝硬化、肝癌的風險明顯較高，所以第一劑安排在出生24小時內。",
                doses: [pub("第一劑", 0), pub("第二劑", 1), pub("第三劑", 6)]),

        Vaccine(id: "hbig", name: "B型肝炎免疫球蛋白", en: "HBIG",
                description: "這不是疫苗，而是現成的抗體。母親若是B型肝炎帶原者，寶寶出生24小時內施打可以立刻提供保護，再搭配B肝疫苗建立自己的長期免疫力。",
                doses: [slf("第一劑", 0)],
                note: "母親為B型肝炎表面抗原陽性之新生兒可公費施打"),

        Vaccine(id: "dtap-hib-ipv", name: "五合一疫苗", en: "DTaP-Hib-IPV",
                description: "一針同時預防白喉、破傷風、非細胞性百日咳、b型嗜血桿菌與小兒麻痺五種疾病。百日咳對未滿6個月的嬰兒特別危險，可能引起嚴重咳嗽甚至呼吸困難，按時接種很重要。",
                doses: [pub("第一劑", 2), pub("第二劑", 4), pub("第三劑", 6), pub("第四劑", 18)],
                note: "五合一與六合一可擇一施打"),

        Vaccine(id: "dtap-hib-ipv-hepb", name: "六合一疫苗", en: "DTaP-Hib-IPV-HepB",
                description: "在五合一的基礎上再加入B型肝炎，一針預防六種疾病。可以和五合一擇一組合施打，好處是減少寶寶挨針的次數。",
                doses: [slf("第一劑", 6), slf("第二劑", 18)],
                note: "五合一與六合一可擇一施打"),

        Vaccine(id: "pcv13", name: "13價結合型肺炎鏈球菌疫苗", en: "PCV13",
                description: "預防肺炎鏈球菌引起的侵襲性感染，包括腦膜炎、菌血症與肺炎。兩歲以下幼兒免疫力尚未成熟，是重症的高危險群。",
                doses: [pub("第一劑", 2), pub("第二劑", 4), pub("第三劑", 12)]),

        Vaccine(id: "rotavirus", name: "輪狀病毒疫苗", en: "Rotavirus",
                description: "口服疫苗，預防輪狀病毒引起的嚴重腹瀉與嘔吐。輪狀病毒是嬰幼兒因腹瀉住院最常見的原因，脫水對小寶寶相當危險。市面上有2劑型與3劑型兩種，無優劣之分。",
                doses: [slf("第一劑", 2), slf("第二劑", 4), slf("第三劑", 6)],
                note: "2劑型與3劑型不同廠牌不可混打；部分縣市有補助"),

        Vaccine(id: "meningococcal", name: "流行性腦脊髓膜炎疫苗", en: "Meningococcal",
                description: "預防腦膜炎雙球菌感染。這種細菌可能引起猛爆性敗血症或腦膜炎，病程進展非常快，短時間內就可能危及生命。",
                doses: [slf("第一劑", 2)],
                note: "2個月至成人皆可施打，時程依年紀不同，建議諮詢小兒科醫師"),

        Vaccine(id: "ev71", name: "腸病毒71型疫苗", en: "Enterovirus 71",
                description: "預防腸病毒71型。這一型腸病毒最容易引起重症，可能侵犯腦幹造成神經系統併發症。滿2個月起就可以接種。",
                doses: [slf("第一劑", 2)],
                note: "視廠牌施打 2–3 劑"),

        Vaccine(id: "bcg", name: "卡介苗", en: "BCG",
                description: "預防結核病，特別是嬰幼兒容易發生的結核性腦膜炎與粟粒性結核這類重症。接種部位會經歷紅腫、化膿再結痂的過程，最後留下小疤痕，這是正常反應。",
                doses: [pub("一劑", 5)],
                note: "建議接種時間為出生滿 5–8 個月，施打前建議提前預約"),

        Vaccine(id: "flu", name: "流感疫苗", en: "Influenza",
                description: "預防季節性流感。因為每年流行的病毒株會改變，保護力也會隨時間下降，所以需要每年接種。滿6個月就可以開始打。",
                doses: [pub("第一劑", 6), pub("第二劑", 7)],
                recurring: "之後每年十月起接種一劑",
                note: "未滿9歲初次接種，需隔四週接種第二劑"),

        Vaccine(id: "mmr", name: "麻疹腮腺炎德國麻疹混合疫苗", en: "MMR",
                description: "一針預防麻疹、腮腺炎與德國麻疹。麻疹傳染力極強，可能併發肺炎或腦炎；德國麻疹若由孕婦感染，還可能造成胎兒先天缺陷。",
                doses: [pub("第一劑", 12), pub("第二劑", preschool)]),

        Vaccine(id: "varicella", name: "水痘疫苗", en: "Varicella",
                description: "預防水痘。水痘傳染力很強，多數孩子症狀輕微，但可能併發皮膚細菌感染、肺炎或腦炎。接種後即使仍感染，症狀通常也會輕很多。",
                doses: [pub("第一劑", 12), slf("第二劑", preschool)]),

        Vaccine(id: "je", name: "活性減毒嵌合型日本腦炎疫苗", en: "Japanese encephalitis",
                description: "預防日本腦炎，一種經由三斑家蚊叮咬傳播的病毒性腦炎。發病後可能留下長期的神經系統後遺症，而且沒有特效藥可以治療，接種疫苗是主要的預防方式。",
                doses: [pub("第一劑", 15), pub("第二劑", 27)],
                note: "兩劑間隔 12 個月"),

        Vaccine(id: "hepa", name: "A型肝炎疫苗", en: "Hepatitis A",
                description: "預防經由飲食傳染的A型肝炎。幼兒感染後常常沒有明顯症狀，卻可能把病毒傳染給家裡的大人，而成人發病的症狀通常嚴重得多。",
                doses: [pub("第一劑", 18), pub("第二劑", 27)],
                note: "兩劑需間隔六個月；公費對象為民國 106 年 1 月 1 日（含）以後出生的幼兒"),

        Vaccine(id: "dtap-ipv", name: "四合一疫苗", en: "DTaP-IPV",
                description: "學齡前的加強劑，再次提升白喉、破傷風、百日咳與小兒麻痺的保護力。銜接即將進入小學的團體生活，避免保護力在學齡期下降。",
                doses: [pub("第一劑", preschool)]),
    ]

    static func ageLabel(_ ageMonths: Int) -> String {
        if ageMonths == 0 { return "出生 24 小時內" }
        if ageMonths >= preschool { return "滿 5 歲至入國小前" }
        if ageMonths >= 12 && ageMonths % 12 == 0 { return "滿 \(ageMonths / 12) 歲" }
        if ageMonths > 12 { return "滿 \(ageMonths / 12) 歲 \(ageMonths % 12) 個月" }
        return "滿 \(ageMonths) 個月"
    }

    /// 出生日往後推 N 個月的日期。
    static func doseDate(birthDate: Date, ageMonths: Int, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .month, value: ageMonths, to: birthDate) ?? birthDate
    }

    /// 所有疫苗依接種月齡分組，由小到大；組內公費排在自費前面，其餘維持疫苗定義順序。
    static func milestones(vaccines: [Vaccine] = all) -> [Milestone] {
        var byAge: [Int: [ScheduledDose]] = [:]
        for v in vaccines {
            for d in v.doses {
                byAge[d.ageMonths, default: []].append(ScheduledDose(vaccine: v, dose: d))
            }
        }
        return byAge.keys.sorted().map { age in
            let doses = byAge[age]!.enumerated()
                .sorted { a, b in
                    let ap = a.element.dose.funding == .publicFunded ? 0 : 1
                    let bp = b.element.dose.funding == .publicFunded ? 0 : 1
                    return ap == bp ? a.offset < b.offset : ap < bp
                }
                .map(\.element)
            return Milestone(ageMonths: age, doses: doses, note: milestoneNotes[age])
        }
    }

    /// 最接近、還沒過的接種時間；全部都過了回傳 nil。
    ///
    /// 邊界以「今天 00:00」切：接種日就是今天時仍算即將接種（顯示還有 0 天），
    /// 早於今天才歸為逾期（見 VaccineLog.overdue），兩者剛好接合、不留空隙。
    /// isDone 回報某一劑是否已有施打紀錄；整組都打完的月齡直接跳過。
    static func next(birthDate: Date, asOf now: Date, calendar: Calendar = .current,
                     vaccines: [Vaccine] = all,
                     isDone: (ScheduledDose) -> Bool = { _ in false }) -> Milestone? {
        let today = calendar.startOfDay(for: now)
        return milestones(vaccines: vaccines).first { m in
            let due = doseDate(birthDate: birthDate, ageMonths: m.ageMonths, calendar: calendar)
            return calendar.startOfDay(for: due) >= today && !m.doses.allSatisfy(isDone)
        }
    }
}
