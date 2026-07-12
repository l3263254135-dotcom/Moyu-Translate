import Foundation
import Testing
@testable import MoyuTranslate

struct DictionaryStoreTests {
    @Test func inMemoryLookupIsCaseInsensitive() {
        let store = DictionaryStore(entries: [
            DictionaryEntry(word: "serendipity", partOfSpeech: "n.", meanings: ["意外发现", "机缘巧合"])
        ])
        #expect(store.lookup("Serendipity")?.meanings.first == "意外发现")
        #expect(store.lookup("missing") == nil)
    }

    @Test func legacyJSONWithoutTagsStillDecodes() throws {
        let data = Data(#"{"word":"hover","partOfSpeech":"v.","meanings":["悬停"]}"#.utf8)
        let entry = try JSONDecoder().decode(DictionaryEntry.self, from: data)
        #expect(entry.tags.isEmpty)
    }
}
