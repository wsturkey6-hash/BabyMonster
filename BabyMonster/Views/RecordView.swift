import SwiftUI
import SwiftData

struct RecordView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \RecordEntity.timestamp, order: .reverse) private var records: [RecordEntity]
    @Query private var profiles: [ProfileEntity]
    @State private var showingForm = false
    @State private var editing: RecordEntity?

    private var today: [RecordEntity] {
        records.filter { Calendar.current.isDateInToday($0.timestamp) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let p = profiles.first {
                    Section {
                        Text("\(p.name)　\(BabyAgeCalculator.age(birthDate: p.birthDate, asOf: Date()).displayText)")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Section("今日記錄（\(today.count) 筆）") {
                    ForEach(today) { entity in
                        Button { editing = entity } label: { RecordRow(data: entity.data) }
                            .buttonStyle(.plain)
                    }
                    .onDelete { indexSet in
                        for i in indexSet { context.delete(today[i]) }
                    }
                }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingForm = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingForm) {
                RecordEntryForm { data in context.insert(RecordEntity(data: data)) }
            }
            .sheet(item: $editing) { entity in
                RecordEntryForm(initial: entity.data) { data in entity.apply(data) }
            }
        }
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
                if data.hasUrine { Label("小便", systemImage: "toilet.fill") }
                if let t = data.temperature { Label(String(format: "%.1f°C", t), systemImage: "thermometer") }
                if let w = data.weight { Label("\(Int(w))g", systemImage: "scalemass") }
            }.font(.caption).labelStyle(.titleAndIcon)
        }
    }
}
