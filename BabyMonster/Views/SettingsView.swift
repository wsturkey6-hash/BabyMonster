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
    @Query(sort: \ProfileEntity.birthDate) private var profiles: [ProfileEntity]
    @Query private var records: [RecordEntity]

    @State private var showingImporter = false
    @State private var shareItem: ShareItem?
    @State private var toast: Toast?
    @State private var showingNewBaby = false
    @State private var babyToDelete: ProfileEntity?

    var body: some View {
        NavigationStack {
            Form {
                Section("寶寶") {
                    ForEach(profiles, id: \.id) { p in
                        NavigationLink {
                            BabyEditView(baby: p)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name)
                                Text(BabyAgeCalculator.age(birthDate: p.birthDate, asOf: Date()).displayText)
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexSet in
                        if let i = indexSet.first { babyToDelete = profiles[i] }
                    }
                    Button("新增寶寶") { showingNewBaby = true }
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
            .sheet(item: $shareItem) { item in ShareSheet(items: [item.url]) }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json]) { result in
                handleImport(result)
            }
            .sheet(isPresented: $showingNewBaby) {
                NavigationStack { BabyEditView(baby: nil) }
            }
            .alert(item: $babyToDelete) { baby in
                let count = records.filter { $0.babyId == baby.id }.count
                return Alert(
                    title: Text("刪除「\(baby.name)」？"),
                    message: Text("將一併刪除該寶寶的 \(count) 筆記錄，此動作無法復原。"),
                    primaryButton: .destructive(Text("刪除")) { deleteBaby(baby) },
                    secondaryButton: .cancel(Text("取消")))
            }
            .toast($toast)
            .dismissKeyboardOnTap()
        }
    }

    private var exportFilename: String {
        let f = DateFormatter(); f.dateFormat = "yyyyMMdd"
        return "BabyMonster-\(f.string(from: Date()))"
    }

    private func deleteBaby(_ baby: ProfileEntity) {
        for r in records where r.babyId == baby.id { context.delete(r) }
        context.delete(baby)
        toast = Toast(text: "已刪除寶寶")
    }

    private func prepareExport() {
        guard let first = profiles.first else {
            toast = Toast(text: "尚無寶寶資料可匯出", duration: 2.5); return
        }
        let payload = BackupPayload(profile: first.data, records: records.map { $0.data })
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
                if profiles.isEmpty { context.insert(ProfileEntity(data: payload.profile)) }
                toast = Toast(text: "已匯入並合併，共 \(merged.count) 筆記錄")
            } catch { toast = Toast(text: "匯入失敗：\(error.localizedDescription)", duration: 2.5) }
        }
    }
}
