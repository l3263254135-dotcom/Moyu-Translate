import Testing
@testable import MoyuTranslate

struct TranslationResultTests {
    @Test func collapsedAndExpandedMeanings() {
        let result = TranslationResult(
            sourceText: "serendipity",
            primaryText: "意外发现",
            alternatives: ["机缘巧合", "意想不到的好运", "不应展示"],
            partOfSpeech: "n.",
            provider: "ECDICT",
            latencyMilliseconds: 2
        )
        #expect(result.visibleMeanings(expanded: false) == ["意外发现"])
        #expect(result.visibleMeanings(expanded: true) == ["意外发现", "机缘巧合", "意想不到的好运"])
    }
}
