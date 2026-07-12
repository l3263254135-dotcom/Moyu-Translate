import Foundation
import Testing
@testable import MoyuTranslate

struct PreferencesStoreTests {
    @Test @MainActor func preferencesPersistAcrossInstances() {
        let suiteName = "MoyuTranslateTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let first = PreferencesStore(defaults: defaults, defaultTheme: .light)
        first.theme = .dark
        first.direction = .englishToChinese
        first.isPinned = true

        let second = PreferencesStore(defaults: defaults, defaultTheme: .light)
        #expect(second.theme == .dark)
        #expect(second.direction == .englishToChinese)
        #expect(second.isPinned)
    }
}
