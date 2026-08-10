import SwiftUI
import SwiftData

struct VaccineView: View {
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @Query private var doseLogs: [VaccineDoseEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var selected: Vaccine?

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    /// 目前寶寶的施打紀錄：key → 施打日期。
    private var done: [String: Date] {
        guard let baby = currentBaby else { return [:] }
        return VaccineLog.doneKeys(doseLogs.filter { $0.babyId == baby.id }.map(\.data))
    }

    private func doneDate(_ vaccineId: String, _ doseLabel: String) -> Date? {
        guard let baby = currentBaby else { return nil }
        return done[VaccineLog.key(babyId: baby.id, vaccineId: vaccineId, doseLabel: doseLabel)]
    }

    private var upcoming: Milestone? {
        guard let baby = currentBaby else { return nil }
        return Vaccines.next(birthDate: baby.birthDate, asOf: Date(),
                             isDone: { doneDate($0.vaccine.id, $0.dose.label) != nil })
    }

    private var overdue: [ScheduledDose] {
        guard let baby = currentBaby else { return [] }
        return VaccineLog.overdue(birthDate: baby.birthDate, asOf: Date(),
                                  babyId: baby.id, done: done)
    }

    var body: some View {
        NavigationStack {
            List {
                upcomingSection
                scheduleSection
                sourceSection
            }
            .navigationTitle("疫苗")
            .toolbar { ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) } }
            .sheet(item: $selected) { vaccine in
                VaccineDetailSheet(vaccine: vaccine, baby: currentBaby)
            }
        }
    }

    @ViewBuilder
    private var upcomingSection: some View {
        Section("接下來要打的疫苗") {
            if !overdue.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("這幾劑的接種日已經過了，還沒記錄施打日期")
                        .font(.footnote.bold()).foregroundStyle(.red)
                    overdueGroup(.publicFunded, title: "公費")
                    overdueGroup(.selfPaid, title: "自費（依醫師建議選擇性接種）")
                }
                .padding(.vertical, 2)
            }
            if currentBaby == nil {
                Text("尚未建立寶寶，請先到設定頁新增，才能依生日推算接種時間。")
                    .foregroundStyle(.secondary)
            } else if let m = upcoming, let baby = currentBaby {
                let date = Vaccines.doseDate(birthDate: baby.birthDate, ageMonths: m.ageMonths)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Vaccines.ageLabel(m.ageMonths)).font(.headline)
                    Text("\(date, format: .dateTime.year().month().day())（還有 \(daysUntil(date)) 天）")
                        .font(.caption).foregroundStyle(.secondary)
                }
                fundingRows(m.doses)
                if let note = m.note { noteText(note) }
            } else {
                Text("時程表上的疫苗都已經過了接種年齡。").foregroundStyle(.secondary)
            }
        }
    }

    private var scheduleSection: some View {
        Section("接種時程表") {
            Text("點疫苗名稱可以看它預防什麼。").font(.footnote).foregroundStyle(.secondary)
            ForEach(Vaccines.milestones()) { m in
                VStack(alignment: .leading, spacing: 6) {
                    Text(Vaccines.ageLabel(m.ageMonths))
                        .font(.subheadline.bold()).foregroundStyle(.tint)
                    ForEach(m.doses) { d in vaccineButton(d) }
                    if let note = m.note { noteText(note) }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var sourceSection: some View {
        Section("資料來源") {
            Text("公費時程整理自衛生福利部疾病管制署「現行兒童預防接種時程表（兒童常規疫苗）」\(Vaccines.sourceNotePublic)；自費時程整理自 \(Vaccines.sourceNoteSelf)。")
                .font(.footnote).foregroundStyle(.secondary)
            Text("自費疫苗的劑數與月齡會依廠牌、診所而不同，時程也會不定期調整。實際接種時間與項目請以兒童健康手冊及醫師評估為準。")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func fundingRows(_ doses: [ScheduledDose]) -> some View {
        ForEach([Funding.publicFunded, Funding.selfPaid], id: \.rawValue) { funding in
            let group = doses.filter { $0.dose.funding == funding }
            VStack(alignment: .leading, spacing: 6) {
                Text(funding.displayName)
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(funding == .publicFunded ? Color.orange.opacity(0.18) : Color.pink.opacity(0.15))
                    .clipShape(Capsule())
                if group.isEmpty {
                    Text("這次沒有\(funding.displayName)疫苗。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(group) { d in vaccineButton(d) }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func vaccineButton(_ d: ScheduledDose) -> some View {
        let date = doneDate(d.vaccine.id, d.dose.label)
        return Button { selected = d.vaccine } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.vaccine.name).font(.subheadline)
                    if let date {
                        Text("\(d.dose.label)・\(date, format: .dateTime.year().month().day())")
                            .font(.caption).foregroundStyle(Color.doseDoneText)
                    } else {
                        Text("\(d.dose.label)・\(d.dose.funding.displayName)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Image(systemName: date != nil ? "checkmark.circle.fill" : "info.circle")
                    .foregroundStyle(date != nil ? Color.doseDoneText : Color.accentColor)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(date != nil ? Color.doseDoneFill : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func overdueGroup(_ funding: Funding, title: String) -> some View {
        let items = overdue.filter { $0.dose.funding == funding }
        if !items.isEmpty, let baby = currentBaby {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption.bold())
                    .foregroundStyle(funding == .publicFunded ? Color.red : Color.secondary)
                ForEach(items) { d in
                    let due = Vaccines.doseDate(birthDate: baby.birthDate,
                                                ageMonths: d.dose.ageMonths)
                    Button { selected = d.vaccine } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(d.vaccine.name) \(d.dose.label)").font(.subheadline)
                            Text("預計 \(due, format: .dateTime.year().month().day())・逾期 \(-daysUntil(due)) 天")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func noteText(_ note: String) -> some View {
        Text(note)
            .font(.footnote)
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func daysUntil(_ target: Date) -> Int {
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: Date()),
                                  to: cal.startOfDay(for: target)).day ?? 0
    }
}

struct VaccineDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var doseLogs: [VaccineDoseEntity]
    let vaccine: Vaccine
    let baby: ProfileEntity?

    private func entity(_ doseLabel: String) -> VaccineDoseEntity? {
        guard let baby else { return nil }
        let key = VaccineLog.key(babyId: baby.id, vaccineId: vaccine.id, doseLabel: doseLabel)
        return doseLogs.first { $0.key == key }
    }

    var body: some View {
        NavigationStack {
            List {
                Section { Text(vaccine.description) }
                Section("接種時程與施打日期") {
                    if baby == nil {
                        Text("尚未建立寶寶，請先到設定頁新增，才能記錄施打日期。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    ForEach(vaccine.doses) { d in doseRow(d) }
                    if let r = vaccine.recurring {
                        Text(r).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                if let note = vaccine.note {
                    Section("附註") { Text(note).font(.footnote) }
                }
            }
            .navigationTitle(vaccine.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("關閉") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private func doseRow(_ d: VaccineDose) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(Vaccines.ageLabel(d.ageMonths))・\(d.label)・\(d.funding.displayName)")
                .font(.caption).foregroundStyle(.secondary)
            if let baby {
                if let e = entity(d.label) {
                    HStack {
                        DatePicker("施打日期",
                                   selection: Binding(get: { e.date }, set: { e.date = $0 }),
                                   displayedComponents: .date)
                            .labelsHidden()
                        Spacer()
                        Button("清除", role: .destructive) { context.delete(e) }
                            .font(.caption)
                    }
                } else {
                    // DatePicker 永遠有值、無法表達「沒有日期」，所以未施打時只給按鈕。
                    // 按下以預計接種日建立紀錄，再讓使用者微調。
                    let planned = Vaccines.doseDate(birthDate: baby.birthDate,
                                                    ageMonths: d.ageMonths)
                    Button("記錄施打（預設 \(planned, format: .dateTime.year().month().day())）") {
                        context.insert(VaccineDoseEntity(data: VaccineDoseData(
                            babyId: baby.id, vaccineId: vaccine.id,
                            doseLabel: d.label, date: planned)))
                    }
                    .font(.subheadline)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

private extension Color {
    /// 已施打的標籤配色。淺綠底＋深綠字，與白底的對比高於 4.5:1。
    static let doseDoneFill = Color(red: 0.93, green: 0.97, blue: 0.94)
    static let doseDoneText = Color(red: 0.13, green: 0.42, blue: 0.26)
}
