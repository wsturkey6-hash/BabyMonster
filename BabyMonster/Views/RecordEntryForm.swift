import SwiftUI

struct RecordEntryForm: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (RecordData) -> Void

    @State private var timestamp: Date
    @State private var feedText = ""
    @State private var stoolColor: Int? = nil
    @State private var stoolAmount: StoolAmount? = nil
    @State private var stoolShape: BristolType? = nil
    @State private var hasUrine = false
    @State private var tempText = ""
    @State private var weightText = ""
    @State private var note = ""

    private let existingID: UUID

    init(initial: RecordData? = nil, onSave: @escaping (RecordData) -> Void) {
        self.onSave = onSave
        _timestamp = State(initialValue: initial?.timestamp ?? Date())
        _feedText = State(initialValue: initial?.feedAmount.map { String($0) } ?? "")
        _stoolColor = State(initialValue: initial?.stoolColor)
        _stoolAmount = State(initialValue: initial?.stoolAmount)
        _stoolShape = State(initialValue: initial?.stoolShape)
        _hasUrine = State(initialValue: initial?.hasUrine ?? false)
        _tempText = State(initialValue: initial?.temperature.map { String($0) } ?? "")
        _weightText = State(initialValue: initial?.weight.map { String($0) } ?? "")
        _note = State(initialValue: initial?.note ?? "")
        self.existingID = initial?.id ?? UUID()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("時間") { DatePicker("時間", selection: $timestamp) }

                Section("喝奶") {
                    TextField("喝奶量 (ml)", text: $feedText).keyboardType(.decimalPad)
                }

                Section("大便") {
                    stoolColorPicker
                    if let c = stoolColor, StoolColorCard.isAbnormal(c) {
                        Label("顏色 \(c) 號屬異常色系，建議記錄並就診時告知醫生", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange).font(.footnote)
                    }
                    Picker("量", selection: $stoolAmount) {
                        Text("未選").tag(StoolAmount?.none)
                        ForEach(StoolAmount.allCases) { Text($0.displayName).tag(StoolAmount?.some($0)) }
                    }
                    Picker("形狀（布里斯托）", selection: $stoolShape) {
                        Text("未選").tag(BristolType?.none)
                        ForEach(BristolType.allCases) { Text($0.displayName).tag(BristolType?.some($0)) }
                    }
                }

                Section("小便") { Toggle("有小便", isOn: $hasUrine) }

                Section("生命徵象") {
                    TextField("體溫 (°C)", text: $tempText).keyboardType(.decimalPad)
                    TextField("體重 (g)", text: $weightText).keyboardType(.decimalPad)
                }

                Section("備註") { TextField("備註", text: $note, axis: .vertical) }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { save() } }
            }
        }
    }

    private var stoolColorPicker: some View {
        VStack(alignment: .leading) {
            Text("顏色卡（1–9，實體卡為準）").font(.footnote).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 8) {
                ForEach(StoolColorCard.all, id: \.self) { n in
                    Button {
                        stoolColor = (stoolColor == n) ? nil : n
                    } label: {
                        Text("\(n)")
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background(StoolColorCard.color(for: n))
                            .foregroundStyle(.black)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6)
                                .stroke(stoolColor == n ? Color.accentColor : .clear, lineWidth: 3))
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private func save() {
        let data = RecordData(
            id: existingID, timestamp: timestamp,
            feedAmount: Double(feedText.trimmingCharacters(in: .whitespaces)),
            stoolColor: stoolColor, stoolAmount: stoolAmount, stoolShape: stoolShape,
            hasUrine: hasUrine,
            temperature: Double(tempText.trimmingCharacters(in: .whitespaces)),
            weight: Double(weightText.trimmingCharacters(in: .whitespaces)),
            note: note.isEmpty ? nil : note)
        onSave(data)
        dismiss()
    }
}
