import Foundation
import SwiftData

enum AppModelContainer {
    static let schema = Schema([RecordEntity.self, ProfileEntity.self, VaccineDoseEntity.self])

    static func makeInMemory() throws -> ModelContainer {
        try ModelContainer(for: schema, configurations: [ModelConfiguration(isStoredInMemoryOnly: true)])
    }

    static func makePersistent() throws -> ModelContainer {
        try ModelContainer(for: schema, configurations: [ModelConfiguration(isStoredInMemoryOnly: false)])
    }
}
