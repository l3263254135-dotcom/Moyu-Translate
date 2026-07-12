import Foundation
import Observation
import Translation

@MainActor
@Observable
final class AppleTranslationService {
    struct PendingRequest {
        let text: String
        let source: SupportedLanguage
        let target: SupportedLanguage
        let continuation: CheckedContinuation<String, Error>
    }

    var configuration: TranslationSession.Configuration?
    private(set) var statusText = "语言包将在首次翻译时由系统检查"
    @ObservationIgnored private var pendingRequest: PendingRequest?

    func translate(
        _ text: String,
        source: SupportedLanguage,
        target: SupportedLanguage
    ) async throws -> String {
        if let pendingRequest {
            pendingRequest.continuation.resume(throwing: CancellationError())
            self.pendingRequest = nil
        }

        return try await withCheckedThrowingContinuation { continuation in
            pendingRequest = PendingRequest(text: text, source: source, target: target, continuation: continuation)
            var next = configuration ?? TranslationSession.Configuration()
            next.source = source.localeLanguage
            next.target = target.localeLanguage
            next.invalidate()
            configuration = next
            statusText = "正在准备本地语言包..."
        }
    }

    func handle(session: TranslationSession) async {
        guard let pendingRequest,
              session.sourceLanguage == pendingRequest.source.localeLanguage,
              session.targetLanguage == pendingRequest.target.localeLanguage else { return }
        self.pendingRequest = nil
        do {
            try await session.prepareTranslation()
            let response = try await session.translate(pendingRequest.text)
            statusText = "Apple 本地翻译已就绪"
            pendingRequest.continuation.resume(returning: response.targetText)
        } catch {
            statusText = "语言包不可用"
            pendingRequest.continuation.resume(
                throwing: TranslationFailure.translationUnavailable(Self.message(for: error))
            )
        }
    }

    private static func message(for error: Error) -> String {
        let description = error.localizedDescription
        if description.isEmpty {
            return TranslationFailure.languagePackUnavailable.localizedDescription
        }
        return "本地翻译失败：\(description)"
    }
}
