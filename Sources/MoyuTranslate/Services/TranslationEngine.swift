import Foundation

@MainActor
final class TranslationEngine {
    private let dictionary: DictionaryLookingUp
    private let appleTranslation: AppleTranslationService

    init(dictionary: DictionaryLookingUp, appleTranslation: AppleTranslationService) {
        self.dictionary = dictionary
        self.appleTranslation = appleTranslation
    }

    func translate(_ request: TranslationRequest) async throws -> TranslationResult {
        let text = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw TranslationFailure.emptyInput }
        guard text.count <= 1_000 else { throw TranslationFailure.inputTooLong }
        let startedAt = Date()

        if request.sourceLanguage == .english,
           let word = LanguageResolver.normalizedSingleEnglishWord(text),
           let entry = dictionary.lookup(word),
           let primary = entry.meanings.first {
            return TranslationResult(
                sourceText: text,
                primaryText: primary,
                alternatives: Array(entry.meanings.dropFirst().prefix(2)),
                partOfSpeech: entry.partOfSpeech,
                provider: "ECDICT",
                latencyMilliseconds: Self.elapsedMilliseconds(since: startedAt)
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
            latencyMilliseconds: Self.elapsedMilliseconds(since: startedAt)
        )
    }

    private static func elapsedMilliseconds(since date: Date) -> Int {
        max(0, Int(Date().timeIntervalSince(date) * 1_000))
    }
}
