import Testing
@testable import MoyuTranslate

struct LanguageResolverTests {
    @Test func automaticEnglishDirection() throws {
        let direction = try LanguageResolver.direction(for: "serendipity", preference: .automatic)
        #expect(direction.0 == .english)
        #expect(direction.1 == .simplifiedChinese)
    }

    @Test func automaticChineseDirection() throws {
        let direction = try LanguageResolver.direction(for: "摸鱼翻译", preference: .automatic)
        #expect(direction.0 == .simplifiedChinese)
        #expect(direction.1 == .english)
    }

    @Test func singleWordNormalization() {
        #expect(LanguageResolver.normalizedSingleEnglishWord("  Serendipity  ") == "serendipity")
        #expect(LanguageResolver.normalizedSingleEnglishWord("hello world") == nil)
        #expect(LanguageResolver.normalizedSingleEnglishWord("摸鱼") == nil)
    }
}
