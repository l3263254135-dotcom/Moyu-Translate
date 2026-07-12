import Foundation

enum LanguageResolver {
    static func direction(for text: String, preference: LanguageDirection) throws -> (SupportedLanguage, SupportedLanguage) {
        switch preference {
        case .englishToChinese:
            return (.english, .simplifiedChinese)
        case .chineseToEnglish:
            return (.simplifiedChinese, .english)
        case .automatic:
            let hasChinese = text.unicodeScalars.contains { scalar in
                (0x3400...0x4DBF).contains(scalar.value) ||
                    (0x4E00...0x9FFF).contains(scalar.value) ||
                    (0xF900...0xFAFF).contains(scalar.value)
            }
            let hasLatin = text.unicodeScalars.contains { scalar in
                (65...90).contains(scalar.value) || (97...122).contains(scalar.value)
            }
            if hasChinese { return (.simplifiedChinese, .english) }
            if hasLatin { return (.english, .simplifiedChinese) }
            throw TranslationFailure.unsupportedLanguage
        }
    }

    static func normalizedSingleEnglishWord(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains(where: { $0.isWhitespace }) else { return nil }
        let allowed = CharacterSet.letters.union(CharacterSet(charactersIn: "'-"))
        guard trimmed.unicodeScalars.allSatisfy(allowed.contains), trimmed.unicodeScalars.contains(where: { $0.isASCII }) else {
            return nil
        }
        return trimmed.lowercased()
    }
}
