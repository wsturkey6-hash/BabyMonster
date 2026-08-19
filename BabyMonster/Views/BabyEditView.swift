import SwiftUI
import SwiftData

/// 編輯（baby != nil）或新增（baby == nil）寶寶。
struct BabyEditView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let baby: ProfileEntity?

    @State private var name: String
    @State private var birthDate: Date
    @State private var sex: Sex?

    init(baby: ProfileEntity?) {
        self.baby = baby
        _name = State(initialValue: baby?.name ?? "")
        _birthDate = State(initialValue: baby?.birthDate ?? Calendar.current.startOfDay(for: Date()))
        _sex = State(initialValue: baby?.sex)
    }

    var body: some View {
        Form {
            TextField("名字", text: $name)
            DatePicker("生日", selection: $birthDate, displayedComponents: .date)
            Text("目前年齡：\(BabyAgeCalculator.age(birthDate: birthDate, asOf: Date()).displayText)")
                .foregroundStyle(.secondary)
            Picker("性別", selection: $sex) {
                Text("未設定").tag(Sex?.none)
                ForEach(Sex.allCases) { Text($0.displayName).tag(Sex?.some($0)) }
            }
            Text("生長曲線的參考標準男女不同，選了才算得出百分位。不填也不影響其他功能。")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .navigationTitle(baby == nil ? "新增寶寶" : "編輯寶寶")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("儲存") { save() }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .dismissKeyboardOnTap()
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let baby {
            baby.name = trimmed; baby.birthDate = birthDate; baby.sex = sex
        } else {
            context.insert(ProfileEntity(name: trimmed, birthDate: birthDate, sexRaw: sex?.rawValue))
        }
        dismiss()
    }
}
