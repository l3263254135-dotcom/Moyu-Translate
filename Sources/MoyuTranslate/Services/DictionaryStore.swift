import Foundation
import SQLite3

protocol DictionaryLookingUp: Sendable {
    func lookup(_ word: String) -> DictionaryEntry?
}

final class DictionaryStore: DictionaryLookingUp, @unchecked Sendable {
    private let lock = NSLock()
    private var database: OpaquePointer?
    private let fallback: [String: DictionaryEntry]

    init(databaseURL: URL? = ResourceLocator.url(forResource: "dictionary", withExtension: "sqlite")) {
        if let databaseURL {
            var openedDatabase: OpaquePointer?
            if sqlite3_open_v2(databaseURL.path, &openedDatabase, SQLITE_OPEN_READONLY, nil) == SQLITE_OK {
                database = openedDatabase
            } else {
                if let openedDatabase { sqlite3_close(openedDatabase) }
                database = nil
            }
        }
        fallback = Self.loadFallback()
    }

    init(entries: [DictionaryEntry]) {
        database = nil
        fallback = Dictionary(uniqueKeysWithValues: entries.map { ($0.word.lowercased(), $0) })
    }

    deinit {
        if let database { sqlite3_close(database) }
    }

    func lookup(_ word: String) -> DictionaryEntry? {
        let normalized = word.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return nil }

        lock.lock()
        defer { lock.unlock() }

        guard let database else { return fallback[normalized] }
        let query = "SELECT word, part_of_speech, meanings, tags FROM entries WHERE word = ?1 LIMIT 1"
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, query, -1, &statement, nil) == SQLITE_OK else {
            return fallback[normalized]
        }
        defer { sqlite3_finalize(statement) }

        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        sqlite3_bind_text(statement, 1, normalized, -1, transient)
        guard sqlite3_step(statement) == SQLITE_ROW else { return fallback[normalized] }

        let storedWord = String(cString: sqlite3_column_text(statement, 0))
        let partOfSpeech = sqlite3_column_text(statement, 1).map { String(cString: $0) }
        let meaningsJSON = String(cString: sqlite3_column_text(statement, 2))
        let meanings = (try? JSONDecoder().decode([String].self, from: Data(meaningsJSON.utf8))) ?? []
        let tagsJSON = sqlite3_column_text(statement, 3).map { String(cString: $0) } ?? "[]"
        let tags = (try? JSONDecoder().decode([String].self, from: Data(tagsJSON.utf8))) ?? []
        guard !meanings.isEmpty else { return fallback[normalized] }
        return DictionaryEntry(word: storedWord, partOfSpeech: partOfSpeech, meanings: meanings, tags: tags)
    }

    private static func loadFallback() -> [String: DictionaryEntry] {
        guard let url = ResourceLocator.url(forResource: "fallback_dictionary", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entries = try? JSONDecoder().decode([DictionaryEntry].self, from: data) else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: entries.map { ($0.word.lowercased(), $0) })
    }
}
