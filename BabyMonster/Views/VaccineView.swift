import SwiftUI
import SwiftData

struct VaccineView: View {
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var selected: Vaccine?

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    private var upcoming: Milestone? {
        guard let baby = currentBaby else { return nil }
        return Vaccines.next(birthDate: baby.birthDate, asOf: Date())
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
            .sheet(item: $selected) { vaccine in VaccineDetailSheet(vaccine: vaccine) }
        }
    }

    @ViewBuilder
    private var upcomingSection: some View {
        Section("接下來要打的疫苗") {
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
        Button { selected = d.vaccine } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.vaccine.name).font(.subheadline)
                    Text("\(d.dose.label)・\(d.dose.funding.displayName)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "info.circle").foregroundStyle(.tint)
            }
        }
        .buttonStyle(.plain)
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
    let vaccine: Vaccine

    var body: some View {
        NavigationStack {
            List {
                Section { Text(vaccine.description) }
                Section("接種時程") {
                    ForEach(vaccine.doses) { d in
                        HStack {
                            Text(Vaccines.ageLabel(d.ageMonths))
                            Spacer()
                            Text("\(d.label)・\(d.funding.displayName)")
                                .foregroundStyle(.secondary)
                        }
                    }
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
}
