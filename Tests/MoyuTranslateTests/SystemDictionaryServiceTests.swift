import Testing
@testable import MoyuTranslate

struct SystemDictionaryServiceTests {
    @Test func sanitizerCompactsBlankLines() {
        let definition = " ability  \n\n  能力 \n  \n 才智 "
        #expect(SystemDictionaryDefinitionSanitizer.sanitize(definition) == "ability\n能力\n才智")
    }

    @Test func sanitizerRejectsWhitespaceOnlyDefinition() {
        #expect(SystemDictionaryDefinitionSanitizer.sanitize(" \n  ") == nil)
    }

    @Test func sanitizerLimitsOversizedDefinitions() {
        let result = SystemDictionaryDefinitionSanitizer.sanitize(String(repeating: "a", count: 1_300))
        #expect(result?.count == 1_203)
        #expect(result?.hasSuffix("...") == true)
    }
}
