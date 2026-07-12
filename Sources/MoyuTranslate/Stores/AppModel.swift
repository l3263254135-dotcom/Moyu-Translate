import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    let preferences: PreferencesStore
    let appleTranslation: AppleTranslationService

    var query = ""
    private(set) var result: TranslationResult?
    private(set) var isWorking = false
    private(set) var errorMessage: String?
    var isExpanded = false
    var isDictionaryExpanded = false
    private(set) var focusRequestID = UUID()

    @ObservationIgnored private let engine: TranslationEngine
    @ObservationIgnored var onDismiss: (() -> Void)?
    @ObservationIgnored var onCapture: (() async -> Void)?
    @ObservationIgnored var onPinnedChanged: ((Bool) -> Void)?

    init(
        preferences: PreferencesStore,
        appleTranslation: AppleTranslationService,
        engine: TranslationEngine
    ) {
        self.preferences = preferences
        self.appleTranslation = appleTranslation
        self.engine = engine
    }

    func requestFocus() {
        focusRequestID = UUID()
    }

    func submit(origin: TranslationOrigin = .manual) async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            errorMessage = TranslationFailure.emptyInput.localizedDescription
            result = nil
            return
        }

        do {
            let languages = try LanguageResolver.direction(for: text, preference: preferences.direction)
            isWorking = true
            errorMessage = nil
            isExpanded = false
            isDictionaryExpanded = false
            result = try await engine.translate(
                TranslationRequest(
                    text: text,
                    origin: origin,
                    sourceLanguage: languages.0,
                    targetLanguage: languages.1,
                    dictionaryOptions: preferences.dictionaryOptions
                )
            )
        } catch is CancellationError {
            isWorking = false
            return
        } catch {
            result = nil
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        isWorking = false
    }

    func applyCapturedText(_ capturedText: CapturedText) async {
        query = capturedText.text
        requestFocus()
        await submit(origin: capturedText.origin)
    }

    func captureAtAnchor() {
        guard let onCapture else { return }
        Task { await onCapture() }
    }

    func toggleTheme() {
        preferences.theme = preferences.theme == .light ? .dark : .light
    }

    func togglePinned() {
        preferences.isPinned.toggle()
        onPinnedChanged?(preferences.isPinned)
    }

    func copyPrimaryResult() {
        guard let primary = result?.primaryText else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(primary, forType: .string)
    }

    func setError(_ error: Error) {
        result = nil
        errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        isWorking = false
    }

    func dismiss() {
        onDismiss?()
    }
}
