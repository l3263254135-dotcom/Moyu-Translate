import SwiftUI

struct IconToolButton: View {
    let systemName: String
    let help: String
    var isActive = false
    let action: () -> Void

    @Environment(PreferencesStore.self) private var preferences

    var body: some View {
        let palette = ThemePalette.palette(for: preferences.theme)
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 26, height: 26)
                .foregroundStyle(isActive ? palette.accent : palette.secondaryText)
                .background(
                    Circle().fill(isActive ? palette.accent.opacity(0.12) : palette.elevated)
                )
                .overlay(
                    Circle().stroke(isActive ? palette.accent : palette.separator, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityLabel(help)
    }
}
