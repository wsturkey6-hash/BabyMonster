import SwiftUI
import SwiftData

struct RecordView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \RecordEntity.timestamp, order: .reverse) private var records: [RecordEntity]
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""
    @State private var showingForm = false
    @State private var editing: RecordEntity?
    @State private var viewDate = Date()

    private var currentBaby: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    private var dayRecords: [RecordEntity] {
        records.filter {
            $0.babyId == currentBaby?.id
                && Calendar.current.isDate($0.timestamp, inSameDayAs: viewDate)
        }
    }

    private var isViewingToday: Bool { Calendar.current.isDateInToday(viewDate) }

    var body: some View {
        NavigationStack {
            List {
                if let p = currentBaby {
                    Section {
                        Text("\(p.name)　\(BabyAgeCalculator.age(birthDate: p.birthDate, asOf: Date()).displayText)")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Section { DatePicker("日期", selection: $viewDate, displayedComponents: .date) }

                Section(isViewingToday
                        ? "今日記錄（\(dayRecords.count) 筆）"
                        : "\(viewDate.formatted(.dateTime.month().day())) 記錄（\(dayRecords.count) 筆）") {
                    if dayRecords.isEmpty {
                        Text(isViewingToday ? "今天還沒有記錄。" : "這天沒有記錄。")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(dayRecords) { entity in
                        Button { editing = entity } label: { RecordRow(data: entity.data) }
                            .buttonStyle(.plain)
                    }
                    .onDelete { indexSet in
                        for i in indexSet { context.delete(dayRecords[i]) }
                    }
                }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { BabyPickerMenu(profiles: profiles) }
                ToolbarItem(placement: .primaryAction) {
                    Button { showingForm = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingForm) {
                RecordEntryForm(defaultDate: defaultFormDate) { data in
                    var d = data
                    d.babyId = ensureCurrentBaby().id
                    context.insert(RecordEntity(data: d))
                }
            }
            .sheet(item: $editing) { entity in
                RecordEntryForm(initial: entity.data) { data in entity.apply(data) }
            }
        }
    }

    /// 看今天就用現在時刻；看往前幾天則落在那天的中午，方便再調時間。
    private var defaultFormDate: Date {
        isViewingToday ? Date()
            : Calendar.current.date(bySettingHour: 12, minute: 0, second: 0, of: viewDate) ?? viewDate
    }

    /// 無任何寶寶時自動建預設寶寶，記錄流程不中斷。
    private func ensureCurrentBaby() -> ProfileEntity {
        if let c = currentBaby { return c }
        let p = ProfileEntity(name: "BabyMonster",
                              birthDate: Calendar.current.startOfDay(for: Date()))
        context.insert(p)
        currentBabyIdString = p.id.uuidString
        return p
    }
}

struct RecordRow: View {
    let data: RecordData
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(data.timestamp, format: .dateTime.hour().minute()).font(.headline)
            HStack(spacing: 10) {
                if let f = data.feedAmount { Label("\(Int(f)) ml", systemImage: "drop.fill") }
                if let c = data.stoolColor {
                    Label("\(c)號", systemImage: "circle.fill")
                        .foregroundStyle(StoolColorCard.isAbnormal(c) ? .orange : .primary)
                }
                if data.hasUrine {
                    Label(data.urineAmount.map { "小便・\($0.displayName)" } ?? "小便",
                          systemImage: "toilet.fill")
                }
                if let t = data.temperature { Label(String(format: "%.1f°C", t), systemImage: "thermometer") }
                if let w = data.weight { Label("\(Int(w))g", systemImage: "scalemass") }
                if let h = data.height { Label(String(format: "%.1f cm", h), systemImage: "ruler") }
                if let hc = data.headCircumference {
                    Label(String(format: "%.1f cm", hc), systemImage: "circle.dashed")
                }
                if let s = data.sleep { Label(s.displayName, systemImage: s.systemImage) }
            }.font(.caption).labelStyle(.titleAndIcon)
        }
    }
}
