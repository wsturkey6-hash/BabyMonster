import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var profiles: [ProfileEntity]
    @Query private var records: [RecordEntity]

    @State private var name = "BabyMonster"
    @State private var birthDate = Date()
    @State private var showingExporter = false
    @State private var showingImporter = false
    @State private var exportDocument = BackupDocument(data: Data())
    @State private var message: String?

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
                }
                Section("資料同步") {
                    Button("匯出資料（分享給家人）") { prepareExport() }
                    Button("匯入資料（合併）") { showingImporter = true }
                }
                if let message { Section { Text(message).font(.footnote).foregroundStyle(.secondary) } }
            }
            .navigationTitle("設定")
            .onAppear { loadProfile() }
            .fileExporter(isPresented: $showingExporter, document: exportDocument,
                          contentType: .json, defaultFilename: exportFilename) { result in
                if case .success = result { message = "已匯出，可用 LINE 傳給家人" }
            }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json]) { result in
                handleImport(result)
            }
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
        message = "已儲存寶寶資料"
    }

    private func prepareExport() {
        let payload = BackupPayload(
            profile: ProfileData(name: name, birthDate: birthDate),
            records: records.map { $0.data })
        do {
            exportDocument = BackupDocument(data: try DataTransfer.encode(payload))
            showingExporter = true
        } catch { message = "匯出失敗：\(error.localizedDescription)" }
    }

    private func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let e): message = "匯入失敗：\(e.localizedDescription)"
        case .success(let url):
            let needsStop = url.startAccessingSecurityScopedResource()
            defer { if needsStop { url.stopAccessingSecurityScopedResource() } }
            do {
                let payload = try DataTransfer.decode(try Data(contentsOf: url))
                let merged = DataTransfer.mergeRecords(local: records.map { $0.data }, incoming: payload.records)
                let existingIDs = Set(records.map { $0.id })
                for r in merged where !existingIDs.contains(r.id) { context.insert(RecordEntity(data: r)) }
                if profile == nil { context.insert(ProfileEntity(data: payload.profile)) }
                message = "已匯入並合併，共 \(merged.count) 筆記錄"
            } catch { message = "匯入失敗：\(error.localizedDescription)" }
        }
    }
}
