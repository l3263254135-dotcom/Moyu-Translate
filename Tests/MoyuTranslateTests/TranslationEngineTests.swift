import Testing
@testable import MoyuTranslate

struct TranslationEngineTests {
    @Test @MainActor func dictionaryWordReturnsCompactResult() async throws {
        let dictionary = DictionaryStore(entries: [
            DictionaryEntry(word: "hover", partOfSpeech: "v.", meanings: ["悬停", "盘旋", "徘徊", "不显示"])
        ])
        let apple = AppleTranslationService()
        let engine = TranslationEngine(dictionary: dictionary, appleTranslation: apple)
        let result = try await engine.translate(
            TranslationRequest(
                text: "Hover",
                origin: .manual,
                sourceLanguage: .english,
                targetLanguage: .simplifiedChinese
            )
        )
        #expect(result.primaryText == "悬停")
        #expect(result.alternatives == ["盘旋", "徘徊"])
        #expect(result.provider == "ECDICT")
    }
}
