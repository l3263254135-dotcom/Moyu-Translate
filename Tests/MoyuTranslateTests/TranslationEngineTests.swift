import Testing
@testable import MoyuTranslate

struct TranslationEngineTests {
    @Test @MainActor func dictionaryWordReturnsCompactResult() async throws {
        let dictionary = DictionaryStore(entries: [
            DictionaryEntry(
                word: "hover",
                partOfSpeech: "v.",
                meanings: ["悬停", "盘旋", "徘徊", "不显示"],
                tags: ["IELTS", "TOEFL"]
            )
        ])
        let apple = AppleTranslationService()
        let engine = TranslationEngine(
            dictionary: dictionary,
            systemDictionary: StubSystemDictionary(definition: "hover | v. 悬停；盘旋"),
            appleTranslation: apple
        )
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
        #expect(result.vocabularyTags == ["IELTS", "TOEFL"])
        #expect(result.dictionarySections.first?.title == "macOS 系统词典")
        #expect(result.dictionarySections.first?.entries == ["hover | v. 悬停；盘旋"])
    }

    @Test @MainActor func dictionaryOptionsHideSupplementalSources() async throws {
        let dictionary = DictionaryStore(entries: [
            DictionaryEntry(word: "hover", partOfSpeech: "v.", meanings: ["悬停"], tags: ["IELTS"])
        ])
        let engine = TranslationEngine(
            dictionary: dictionary,
            systemDictionary: StubSystemDictionary(definition: "不会展示"),
            appleTranslation: AppleTranslationService()
        )
        let result = try await engine.translate(
            TranslationRequest(
                text: "hover",
                origin: .manual,
                sourceLanguage: .english,
                targetLanguage: .simplifiedChinese,
                dictionaryOptions: DictionaryLookupOptions(
                    usesECDICT: true,
                    usesSystemDictionary: false,
                    showsExamTags: false
                )
            )
        )
        #expect(result.dictionarySections.isEmpty)
        #expect(result.vocabularyTags.isEmpty)
    }
}

private struct StubSystemDictionary: SystemDictionaryLookingUp {
    let definition: String?

    func definition(for term: String) -> String? {
        definition
    }
}
