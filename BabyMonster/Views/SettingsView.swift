import SwiftUI
import SwiftData
import UIKit

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

struct ShareItem: Identifiable { let id = UUID(); let url: URL }

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var profiles: [ProfileEntity]
    @Query private var records: [RecordEntity]

    @State private var name = "BabyMonster"
    @State private var birthDate = Date()
    @State private var showingImporter = false
    @State private var shareItem: ShareItem?
    @State private var toast: Toast?

    private var profile: ProfileEntity? { profiles.first }

    var body: some View {
        NavigationStack {
            Form {
                Section("寶寶資料") {
                    TextField("名字", text: $name)
                    DatePicker("生日", selection: $birthDate, displayedComponents: .date)
                    Text("目前年齡：\(BabyAgeCalculator.age(birthDate: birthDate, asOf: Date()).displayText)")
                        .foregroundStyle(.secondary)
                    Button("儲存寶寶資料") { saveProfile() }
                        .buttonStyle(.borderedProminent)
                }
                Section("資料同步") {
                    Button("匯出資料（分享給家人）") { prepareExport() }
                        .buttonStyle(.bordered)
                    Button("匯入資料（合併）") { showingImporter = true }
                        .buttonStyle(.bordered)
                }
            }
            .navigationTitle("設定")
            .onAppear { loadProfile() }
            .sheet(item: $shareItem) { item in ShareSheet(items: [item.url]) }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json]) { result in
                handleImport(result)
            }
            .toast($toast)
            .dismissKeyboardOnTap()
        }
    }

    private var exportFilename: String {
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd"
        return "BabyMonster-\(f.string(from: Date()))"
    }

    private func loadProfile() {
        if let p = profile { name = p.name; birthDate = p.birthDate }
    }

    private func saveProfile() {
        if let p = profile { p.name = name; p.birthDate = birthDate }
        else { context.insert(ProfileEntity(name: name, birthDate: birthDate)) }
        toast = Toast(text: "已儲存寶寶資料")
    }

    private func prepareExport() {
        let payload = BackupPayload(
            profile: ProfileData(name: name, birthDate: birthDate),
            records: records.map { $0.data })
        do {
            let data = try DataTransfer.encode(payload)
            let fileURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(exportFilename).json")
            try data.write(to: fileURL, options: .atomic)
            shareItem = ShareItem(url: fileURL)
            toast = Toast(text: "已產生匯出檔，可透過分享選單傳給家人（例如 LINE）")
        } catch { toast = Toast(text: "匯出失敗：\(error.localizedDescription)", duration: 2.5) }
    }

    private func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e): toast = Toast(text: "匯入失敗：\(e.localizedDescription)", duration: 2.5)
        case .success(let url):
            let needsStop = url.startAccessingSecurityScopedResource()
            defer { if needsStop { url.stopAccessingSecurityScopedResource() } }
            do {
                let payload = try DataTransfer.decode(try Data(contentsOf: url))
                let merged = DataTransfer.mergeRecords(local: records.map { $0.data }, incoming: payload.records)
                let existingIDs = Set(records.map { $0.id })
                for r in merged where !existingIDs.contains(r.id) { context.insert(RecordEntity(data: r)) }
                if profile == nil { context.insert(ProfileEntity(data: payload.profile)) }
                toast = Toast(text: "已匯入並合併，共 \(merged.count) 筆記錄")
            } catch { toast = Toast(text: "匯入失敗：\(error.localizedDescription)", duration: 2.5) }
        }
    }
}
