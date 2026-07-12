import CoreServices
import Foundation

protocol SystemDictionaryLookingUp: Sendable {
    func definition(for term: String) -> String?
}

struct MacSystemDictionaryService: SystemDictionaryLookingUp {
    func definition(for term: String) -> String? {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let text = trimmed as CFString
        let range = CFRange(location: 0, length: CFStringGetLength(text))
        guard let copiedDefinition = DCSCopyTextDefinition(nil, text, range) else { return nil }
        let definition = copiedDefinition.takeRetainedValue() as String
        return SystemDictionaryDefinitionSanitizer.sanitize(definition)
    }
}

enum SystemDictionaryDefinitionSanitizer {
    static func sanitize(_ definition: String) -> String? {
        let lines = definition
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return nil }

        let compact = lines.joined(separator: "\n")
        guard compact.count > 1_200 else { return compact }
        let end = compact.index(compact.startIndex, offsetBy: 1_200)
        return String(compact[..<end]).trimmingCharacters(in: .whitespacesAndNewlines) + "..."
    }
}
