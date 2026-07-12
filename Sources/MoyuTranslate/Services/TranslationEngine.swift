import Foundation

@MainActor
final class TranslationEngine {
    private let dictionary: DictionaryLookingUp
    private let systemDictionary: SystemDictionaryLookingUp
    private let appleTranslation: AppleTranslationService

    init(
        dictionary: DictionaryLookingUp,
        systemDictionary: SystemDictionaryLookingUp = MacSystemDictionaryService(),
        appleTranslation: AppleTranslationService
    ) {
        self.dictionary = dictionary
        self.systemDictionary = systemDictionary
        self.appleTranslation = appleTranslation
    }

    func translate(_ request: TranslationRequest) async throws -> TranslationResult {
        let text = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw TranslationFailure.emptyInput }
        guard text.count <= 1_000 else { throw TranslationFailure.inputTooLong }
        let startedAt = Date()

        let word = request.sourceLanguage == .english
            ? LanguageResolver.normalizedSingleEnglishWord(text)
            : nil
        let entry = word.flatMap(dictionary.lookup)
        let vocabularyTags = request.dictionaryOptions.showsExamTags ? entry?.tags ?? [] : []
        let dictionarySections = supplementalSections(for: word, options: request.dictionaryOptions)

        if request.dictionaryOptions.usesECDICT,
           let entry,
           let primary = entry.meanings.first {
            return TranslationResult(
                sourceText: text,
                primaryText: primary,
                alternatives: Array(entry.meanings.dropFirst().prefix(2)),
                partOfSpeech: entry.partOfSpeech,
                provider: "ECDICT",
                latencyMilliseconds: Self.elapsedMilliseconds(since: startedAt),
                dictionarySections: dictionarySections,
                vocabularyTags: vocabularyTags
            )
        }

        let translated = try await appleTranslation.translate(
            text,
            source: request.sourceLanguage,
            target: request.targetLanguage
        )
        return TranslationResult(
            sourceText: text,
            primaryText: translated,
            alternatives: [],
            partOfSpeech: nil,
            provider: "Apple 本地翻译",
            latencyMilliseconds: Self.elapsedMilliseconds(since: startedAt),
            dictionarySections: dictionarySections,
            vocabularyTags: vocabularyTags
        )
    }

    private func supplementalSections(
        for word: String?,
        options: DictionaryLookupOptions
    ) -> [DictionarySection] {
        guard options.usesSystemDictionary,
              let word,
              let definition = systemDictionary.definition(for: word) else {
            return []
        }
        return [
            DictionarySection(
                source: .systemDictionary,
                title: "macOS 系统词典",
                entries: [definition]
            )
        ]
    }

    private static func elapsedMilliseconds(since date: Date) -> Int {
        max(0, Int(Date().timeIntervalSince(date) * 1_000))
    }
}
