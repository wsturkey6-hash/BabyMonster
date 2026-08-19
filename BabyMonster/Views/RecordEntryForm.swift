import SwiftUI

struct RecordEntryForm: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (RecordData) -> Void

    @State private var timestamp: Date
    @State private var feedText = ""
    @State private var stoolColor: Int? = nil
    @State private var stoolAmount: Amount? = nil
    @State private var stoolShape: BristolType? = nil
    @State private var hasUrine = false
    @State private var urineAmount: Amount? = nil
    @State private var sleep: SleepEvent? = nil
    @State private var tempText = ""
    @State private var weightText = ""
    @State private var heightText = ""
    @State private var headText = ""
    @State private var note = ""

    private let existingID: UUID
    private let existingBabyId: UUID?

    init(initial: RecordData? = nil, defaultDate: Date = Date(),
         onSave: @escaping (RecordData) -> Void) {
        self.onSave = onSave
        _timestamp = State(initialValue: initial?.timestamp ?? defaultDate)
        _feedText = State(initialValue: initial?.feedAmount.map { String($0) } ?? "")
        _stoolColor = State(initialValue: initial?.stoolColor)
        _stoolAmount = State(initialValue: initial?.stoolAmount)
        _stoolShape = State(initialValue: initial?.stoolShape)
        _hasUrine = State(initialValue: initial?.hasUrine ?? false)
        _urineAmount = State(initialValue: initial?.urineAmount)
        _sleep = State(initialValue: initial?.sleep)
        _tempText = State(initialValue: initial?.temperature.map { String($0) } ?? "")
        _weightText = State(initialValue: initial?.weight.map { String($0) } ?? "")
        _heightText = State(initialValue: initial?.height.map { String($0) } ?? "")
        _headText = State(initialValue: initial?.headCircumference.map { String($0) } ?? "")
        _note = State(initialValue: initial?.note ?? "")
        self.existingID = initial?.id ?? UUID()
        self.existingBabyId = initial?.babyId
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
                        Text("未選").tag(Amount?.none)
                        ForEach(Amount.allCases) { Text($0.displayName).tag(Amount?.some($0)) }
                    }
                    Picker("形狀（布里斯托）", selection: $stoolShape) {
                        Text("未選").tag(BristolType?.none)
                        ForEach(BristolType.allCases) { Text($0.displayName).tag(BristolType?.some($0)) }
                    }
                    Text("新生兒／母乳寶寶的便便天生偏軟，常落在第6–7型；此量表偏成人標準，僅供描述參考。")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section("小便") {
                    Toggle("有小便", isOn: $hasUrine)
                    if hasUrine {
                        Picker("量", selection: $urineAmount) {
                            Text("未選").tag(Amount?.none)
                            ForEach(Amount.allCases) { Text($0.displayName).tag(Amount?.some($0)) }
                        }
                    }
                }

                Section("睡眠") {
                    Picker("這筆記錄", selection: $sleep) {
                        Text("不是睡眠記錄").tag(SleepEvent?.none)
                        ForEach(SleepEvent.allCases) { Text($0.displayName).tag(SleepEvent?.some($0)) }
                    }
                    Text("放下去睡時記一筆入睡，醒來時記一筆起床，統計頁會自動算出當天睡了多久。")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section("生命徵象") {
                    TextField("體溫 (°C)", text: $tempText).keyboardType(.decimalPad)
                }

                Section("生長") {
                    TextField("體重 (g)", text: $weightText).keyboardType(.decimalPad)
                    TextField("身高 (cm)", text: $heightText).keyboardType(.decimalPad)
                    TextField("頭圍 (cm)", text: $headText).keyboardType(.decimalPad)
                    Text("記下身高、頭圍之後，「趨勢 → 生長曲線」就能看出寶寶落在第幾百分位。")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section("備註") { TextField("備註", text: $note, axis: .vertical) }
            }
            .navigationTitle("記錄")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { save() } }
            }
            .dismissKeyboardOnTap()
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
                            .foregroundStyle(StoolColorCard.textColor(for: n))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6)
                                .stroke(stoolColor == n ? Color.accentColor : .clear, lineWidth: 3))
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private func save() {
        var data = RecordData(
            id: existingID, timestamp: timestamp,
            feedAmount: Double(feedText.trimmingCharacters(in: .whitespaces)),
            stoolColor: stoolColor, stoolAmount: stoolAmount, stoolShape: stoolShape,
            hasUrine: hasUrine,
            temperature: Double(tempText.trimmingCharacters(in: .whitespaces)),
            weight: Double(weightText.trimmingCharacters(in: .whitespaces)),
            note: note.isEmpty ? nil : note)
        data.height = Double(heightText.trimmingCharacters(in: .whitespaces))
        data.headCircumference = Double(headText.trimmingCharacters(in: .whitespaces))
        data.urineAmount = hasUrine ? urineAmount : nil
        data.sleep = sleep
        data.babyId = existingBabyId
        onSave(data)
        dismiss()
    }
}
