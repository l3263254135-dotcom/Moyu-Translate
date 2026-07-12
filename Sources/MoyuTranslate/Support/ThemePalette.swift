import SwiftUI

struct ThemePalette {
    let background: Color
    let elevated: Color
    let text: Color
    let secondaryText: Color
    let separator: Color
    let accent: Color

    static func palette(for theme: AppTheme) -> ThemePalette {
        switch theme {
        case .light:
            return ThemePalette(
                background: Color(red: 1.00, green: 0.992, blue: 0.98),
                elevated: .white,
                text: Color(red: 0.15, green: 0.14, blue: 0.12),
                secondaryText: Color(red: 0.48, green: 0.43, blue: 0.39),
                separator: Color(red: 0.92, green: 0.89, blue: 0.86),
                accent: Color(red: 0.94, green: 0.59, blue: 0.24)
            )
        case .dark:
            return ThemePalette(
                background: Color(red: 0.13, green: 0.15, blue: 0.15),
                elevated: Color(red: 0.18, green: 0.19, blue: 0.19),
                text: Color(red: 0.95, green: 0.93, blue: 0.90),
                secondaryText: Color(red: 0.66, green: 0.63, blue: 0.59),
                separator: Color(red: 0.25, green: 0.27, blue: 0.26),
                accent: Color(red: 0.95, green: 0.63, blue: 0.30)
            )
        }
    }
}
