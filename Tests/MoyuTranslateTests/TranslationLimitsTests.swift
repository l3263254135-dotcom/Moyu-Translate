import Testing
@testable import MoyuTranslate

struct TranslationLimitsTests {
    @Test @MainActor func rejectsOversizedInputBeforeTranslation() async {
        let dictionary = DictionaryStore(entries: [])
        let apple = AppleTranslationService()
        let engine = TranslationEngine(dictionary: dictionary, appleTranslation: apple)
        do {
            _ = try await engine.translate(
                TranslationRequest(
                    text: String(repeating: "a", count: 1_001),
                    origin: .manual,
                    sourceLanguage: .english,
                    targetLanguage: .simplifiedChinese
                )
            )
            Issue.record("Expected oversized input to fail")
        } catch {
            #expect(error as? TranslationFailure == .inputTooLong)
        }
    }
}
