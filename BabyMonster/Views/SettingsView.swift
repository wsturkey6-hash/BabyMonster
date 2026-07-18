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
    @State private var showingExportOptions = false

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
                    Button("匯出資料（分享給家人）") { showingExportOptions = true }
                        .buttonStyle(.bordered)
                        .confirmationDialog("選擇匯出範圍", isPresented: $showingExportOptions, titleVisibility: .visible) {
                            Button("全部寶寶") { prepareExport(baby: nil) }
                            ForEach(profiles, id: \.id) { p in
                                Button(p.name) { prepareExport(baby: p) }
                            }
                        }
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

    private func deleteBaby(_ baby: ProfileEntity) {
        for r in records where r.babyId == baby.id { context.delete(r) }
        context.delete(baby)
        toast = Toast(text: "已刪除寶寶")
    }

    private func sanitized(_ s: String) -> String {
        s.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
    }

    private func prepareExport(baby: ProfileEntity?) {
        let selectedProfiles = baby.map { [$0.data] } ?? profiles.map { $0.data }
        guard !selectedProfiles.isEmpty else {
            toast = Toast(text: "尚無寶寶資料可匯出", duration: 2.5); return
        }
        let ids = Set(selectedProfiles.map { $0.id })
        let selectedRecords = records.map { $0.data }
            .filter { $0.babyId.map(ids.contains) ?? false }
        let payload = BackupPayloadV2(profiles: selectedProfiles, records: selectedRecords)
        do {
            let data = try DataTransfer.encodeV2(payload)
            let f = DateFormatter(); f.dateFormat = "yyyyMMdd"
            let base = baby.map { "BabyMonster-\(sanitized($0.name))" } ?? "BabyMonster"
            let fileURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(base)-\(f.string(from: Date())).json")
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
                let incoming = try DataTransfer.decodeAny(try Data(contentsOf: url))
                let merged = DataTransfer.mergeBabies(
                    localProfiles: profiles.map { $0.data },
                    localRecords: records.map { $0.data },
                    incomingProfiles: incoming.profiles,
                    incomingRecords: incoming.records)
                let existingProfileIds = Set(profiles.map { $0.id })
                for p in merged.profiles where !existingProfileIds.contains(p.id) {
                    context.insert(ProfileEntity(data: p))
                }
                let existingRecordIds = Set(records.map { $0.id })
                for r in merged.records where !existingRecordIds.contains(r.id) {
                    context.insert(RecordEntity(data: r))
                }
                toast = Toast(text: "已匯入並合併：寶寶 \(merged.profiles.count) 位、共 \(merged.records.count) 筆記錄")
            } catch { toast = Toast(text: "匯入失敗：\(error.localizedDescription)", duration: 2.5) }
        }
    }
}
