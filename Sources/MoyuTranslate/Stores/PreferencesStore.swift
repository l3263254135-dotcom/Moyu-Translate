import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class PreferencesStore {
    private enum Key {
        static let enabled = "enabled"
        static let theme = "theme"
        static let pinned = "pinned"
        static let direction = "direction"
        static let panelFrame = "panelFrame"
        static let launchAtLogin = "launchAtLogin"
    }

    private let defaults: UserDefaults

    var isEnabled: Bool { didSet { defaults.set(isEnabled, forKey: Key.enabled) } }
    var theme: AppTheme { didSet { defaults.set(theme.rawValue, forKey: Key.theme) } }
    var isPinned: Bool { didSet { defaults.set(isPinned, forKey: Key.pinned) } }
    var direction: LanguageDirection { didSet { defaults.set(direction.rawValue, forKey: Key.direction) } }
    var panelFrame: String? { didSet { defaults.set(panelFrame, forKey: Key.panelFrame) } }
    var launchAtLogin: Bool { didSet { defaults.set(launchAtLogin, forKey: Key.launchAtLogin) } }

    init(defaults: UserDefaults = .standard, defaultTheme: AppTheme? = nil) {
        self.defaults = defaults
        if defaults.object(forKey: Key.enabled) == nil {
            defaults.set(true, forKey: Key.enabled)
        }
        isEnabled = defaults.bool(forKey: Key.enabled)
        theme = AppTheme(rawValue: defaults.string(forKey: Key.theme) ?? "")
            ?? defaultTheme
            ?? (NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? .dark : .light)
        isPinned = defaults.bool(forKey: Key.pinned)
        direction = LanguageDirection(rawValue: defaults.string(forKey: Key.direction) ?? "") ?? .automatic
        panelFrame = defaults.string(forKey: Key.panelFrame)
        launchAtLogin = defaults.bool(forKey: Key.launchAtLogin)
    }
}
