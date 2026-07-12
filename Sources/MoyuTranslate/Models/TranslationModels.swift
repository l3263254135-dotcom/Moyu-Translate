import Foundation

enum TranslationOrigin: String, Codable, Sendable {
    case manual
    case accessibility
    case ocr
}

enum SupportedLanguage: String, Codable, CaseIterable, Sendable {
    case english = "en"
    case simplifiedChinese = "zh-Hans"

    var localeLanguage: Locale.Language {
        Locale.Language(identifier: rawValue)
    }

    var shortLabel: String {
        switch self {
        case .english: return "EN"
        case .simplifiedChinese: return "简体中文"
        }
    }
}

struct TranslationRequest: Equatable, Sendable {
    let text: String
    let origin: TranslationOrigin
    let sourceLanguage: SupportedLanguage
    let targetLanguage: SupportedLanguage
}

struct TranslationResult: Equatable, Sendable {
    let sourceText: String
    let primaryText: String
    let alternatives: [String]
    let partOfSpeech: String?
    let provider: String
    let latencyMilliseconds: Int

    func visibleMeanings(expanded: Bool) -> [String] {
        expanded ? [primaryText] + alternatives.prefix(2) : [primaryText]
    }
}

struct DictionaryEntry: Codable, Equatable, Sendable {
    let word: String
    let partOfSpeech: String?
    let meanings: [String]
}

struct CapturedText: Equatable, Sendable {
    let text: String
    let origin: TranslationOrigin
}

enum LanguageDirection: String, CaseIterable, Identifiable, Codable {
    case automatic
    case englishToChinese
    case chineseToEnglish

    var id: String { rawValue }

    var label: String {
        switch self {
        case .automatic: return "自动识别"
        case .englishToChinese: return "英译中"
        case .chineseToEnglish: return "中译英"
        }
    }
}

enum AppTheme: String, CaseIterable, Identifiable, Codable {
    case light
    case dark

    var id: String { rawValue }
    var label: String { self == .light ? "日间" : "夜间" }
}

enum TranslationFailure: LocalizedError, Equatable {
    case emptyInput
    case inputTooLong
    case unsupportedLanguage
    case noTextFound
    case accessibilityPermissionRequired
    case screenRecordingPermissionRequired
    case languagePackUnavailable
    case translationUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .emptyInput: return "请输入要查询的文字"
        case .inputTooLong: return "单次查询最多支持 1,000 个字符"
        case .unsupportedLanguage: return "目前仅支持英文与简体中文"
        case .noTextFound: return "没有识别到光标附近的文字"
        case .accessibilityPermissionRequired: return "请在系统设置中授予辅助功能权限"
        case .screenRecordingPermissionRequired: return "请在系统设置中授予屏幕录制权限"
        case .languagePackUnavailable: return "请先下载 Apple 英中离线语言包"
        case .translationUnavailable(let message): return message
        }
    }
}
