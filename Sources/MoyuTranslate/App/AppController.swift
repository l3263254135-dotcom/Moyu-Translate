import AppKit
import Foundation
import OSLog

@MainActor
final class AppController {
    let preferences = PreferencesStore()
    let permissions = PermissionManager()
    let appleTranslation = AppleTranslationService()
    let model: AppModel

    private let logger = Logger(subsystem: "com.l3263254135.moyutranslate", category: "Lifecycle")
    private let panelCoordinator: PanelCoordinator
    private var hotkeyMonitor: OptionHoldMonitor!

    init() {
        let dictionary = DictionaryStore()
        let engine = TranslationEngine(dictionary: dictionary, appleTranslation: appleTranslation)
        model = AppModel(preferences: preferences, appleTranslation: appleTranslation, engine: engine)
        panelCoordinator = PanelCoordinator(model: model, captureService: TextCaptureService())

        model.onDismiss = { [weak panelCoordinator] in panelCoordinator?.hide() }
        model.onCapture = { [weak panelCoordinator] in await panelCoordinator?.captureAtAnchor() }
        model.onPinnedChanged = { [weak panelCoordinator] pinned in
            panelCoordinator?.pinnedStateDidChange(pinned)
        }
        hotkeyMonitor = OptionHoldMonitor { [weak self] point in
            guard let self, self.preferences.isEnabled else { return }
            self.panelCoordinator.show(at: point)
        }
    }

    func start() {
        NSApp.setActivationPolicy(.accessory)
        hotkeyMonitor.start()
        logger.info("Moyu Translate started")

        #if DEBUG
        let environment = ProcessInfo.processInfo.environment
        if environment["MOYU_SHOW_PANEL_ON_LAUNCH"] == "1" || environment["MOYU_UI_TEST_QUERY"] != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                guard let self else { return }
                self.openPanel()
                if let query = environment["MOYU_UI_TEST_QUERY"] {
                    self.model.query = query
                    Task {
                        await self.model.submit()
                        if environment["MOYU_UI_TEST_EXPANDED"] == "1" {
                            self.model.isExpanded = true
                        }
                        if environment["MOYU_UI_TEST_DICTIONARY_EXPANDED"] == "1" {
                            self.model.isDictionaryExpanded = true
                        }
                    }
                }
            }
        }
        #endif

        let didRequestKey = "didRequestRequiredPermissions"
        if !UserDefaults.standard.bool(forKey: didRequestKey) {
            UserDefaults.standard.set(true, forKey: didRequestKey)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                self?.permissions.requestAccessibility()
                self?.permissions.requestScreenRecording()
            }
        }
    }

    func stop() {
        hotkeyMonitor.stop()
    }

    func openPanel() {
        let point = CGEvent(source: nil)?.location ?? .zero
        panelCoordinator.show(at: point)
    }

    func hidePanel() {
        panelCoordinator.forceHide()
    }
}
