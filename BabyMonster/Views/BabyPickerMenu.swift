import SwiftUI
import SwiftData

/// 導覽列上的寶寶切換器；無寶寶時不顯示。
struct BabyPickerMenu: View {
    let profiles: [ProfileEntity]
    @AppStorage("currentBabyId") private var currentBabyIdString = ""

    private var current: ProfileEntity? {
        CurrentBaby.entity(in: profiles, storedString: currentBabyIdString)
    }

    var body: some View {
        if let current {
            Menu {
                ForEach(profiles, id: \.id) { p in
                    Button {
                        currentBabyIdString = p.id.uuidString
                    } label: {
                        if p.id == current.id {
                            Label(p.name, systemImage: "checkmark")
                        } else {
                            Text(p.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(current.name)
                    Image(systemName: "chevron.down").font(.caption2)
                }
                .font(.subheadline.weight(.medium))
            }
        }
    }
}
