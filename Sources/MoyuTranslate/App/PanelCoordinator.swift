import AppKit
import Observation
import OSLog
import SwiftUI

@MainActor
final class PanelCoordinator: NSObject, NSWindowDelegate {
    private let logger = Logger(subsystem: "com.l3263254135.moyutranslate", category: "Windowing")
    private let panel = FloatingPanel()
    private let model: AppModel
    private let captureService: TextCaptureService
    private let hostingController: NSHostingController<FloatingPanelView>
    private var anchorPoint = CGPoint.zero
    private var globalClickMonitor: Any?
    private var localClickMonitor: Any?
    private var previousApplication: NSRunningApplication?

    init(model: AppModel, captureService: TextCaptureService) {
        self.model = model
        self.captureService = captureService
        hostingController = NSHostingController(rootView: FloatingPanelView(model: model))
        super.init()
        panel.delegate = self
        panel.contentViewController = hostingController
        restorePinnedFrameIfNeeded()
        installDismissMonitors()
        observeContentSize()
        DispatchQueue.main.async { [weak self] in self?.resizePanelToFit() }
    }

    deinit {
        if let globalClickMonitor { NSEvent.removeMonitor(globalClickMonitor) }
        if let localClickMonitor { NSEvent.removeMonitor(localClickMonitor) }
    }

    func show(at quartzPoint: CGPoint) {
        anchorPoint = quartzPoint
        previousApplication = NSWorkspace.shared.frontmostApplication
        if !model.preferences.isPinned {
            positionPanel(near: quartzPoint)
        }
        panel.orderFrontRegardless()
        panel.makeKey()
        model.requestFocus()
        logger.info("Floating panel shown")
    }

    func hide(restorePreviousApplication: Bool = true) {
        guard panel.isVisible, !model.preferences.isPinned else { return }
        panel.orderOut(nil)
        if restorePreviousApplication,
           let previousApplication,
           previousApplication.processIdentifier != ProcessInfo.processInfo.processIdentifier {
            previousApplication.activate()
        }
        logger.info("Floating panel hidden")
    }

    func forceHide() {
        panel.orderOut(nil)
    }

    func pinnedStateDidChange(_ pinned: Bool) {
        if pinned {
            model.preferences.panelFrame = NSStringFromRect(panel.frame)
            panel.collectionBehavior.insert(.stationary)
        } else {
            panel.collectionBehavior.remove(.stationary)
        }
    }

    func captureAtAnchor() async {
        panel.orderOut(nil)
        try? await Task.sleep(for: .milliseconds(90))
        do {
            let captured = try await captureService.capture(at: anchorPoint)
            panel.orderFrontRegardless()
            panel.makeKey()
            await model.applyCapturedText(captured)
        } catch {
            panel.orderFrontRegardless()
            panel.makeKey()
            model.setError(error)
        }
    }

    func windowDidMove(_ notification: Notification) {
        guard model.preferences.isPinned else { return }
        model.preferences.panelFrame = NSStringFromRect(panel.frame)
    }

    private func restorePinnedFrameIfNeeded() {
        guard model.preferences.isPinned,
              let stored = model.preferences.panelFrame else { return }
        let frame = NSRectFromString(stored)
        if frame.width > 0, frame.height > 0 {
            panel.setFrame(frame, display: false)
        }
    }

    private func positionPanel(near quartzPoint: CGPoint) {
        guard let primaryScreen = NSScreen.screens.first else { return }
        let appKitPoint = ScreenCoordinateConverter.appKitPoint(
            fromQuartz: quartzPoint,
            primaryScreenHeight: primaryScreen.frame.height
        )
        let targetScreen = NSScreen.screens.first(where: { $0.frame.contains(appKitPoint) }) ?? primaryScreen
        let visible = targetScreen.visibleFrame
        let size = panel.frame.size

        var x = appKitPoint.x + 16
        if x + size.width > visible.maxX { x = appKitPoint.x - size.width - 16 }
        x = min(max(x, visible.minX + 8), visible.maxX - size.width - 8)

        var y = appKitPoint.y - size.height - 16
        if y < visible.minY { y = appKitPoint.y + 16 }
        y = min(max(y, visible.minY + 8), visible.maxY - size.height - 8)
        panel.setFrameOrigin(CGPoint(x: x, y: y))
    }

    private func installDismissMonitors() {
        globalClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if !self.panel.frame.contains(NSEvent.mouseLocation) {
                    self.hide()
                }
            }
        }
        localClickMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self else { return event }
            let mouse = NSEvent.mouseLocation
            if self.panel.isVisible, !self.panel.frame.contains(mouse) {
                self.hide()
            }
            return event
        }
    }

    private func observeContentSize() {
        withObservationTracking {
            _ = model.result
            _ = model.errorMessage
            _ = model.isExpanded
            _ = model.isDictionaryExpanded
            _ = model.isWorking
        } onChange: { [weak self] in
            DispatchQueue.main.async {
                guard let self else { return }
                self.resizePanelToFit()
                self.observeContentSize()
            }
        }
    }

    private func resizePanelToFit() {
        hostingController.view.layoutSubtreeIfNeeded()
        let fittingHeight = hostingController.view.fittingSize.height
        let targetHeight = min(max(160, fittingHeight), 360)
        guard abs(panel.frame.height - targetHeight) > 1 else { return }

        var frame = panel.frame
        let top = frame.maxY
        frame.size = NSSize(width: 400, height: targetHeight)
        frame.origin.y = top - targetHeight
        if let visibleFrame = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame {
            frame.origin.x = min(
                max(frame.origin.x, visibleFrame.minX + 8),
                visibleFrame.maxX - frame.width - 8
            )
            frame.origin.y = min(
                max(frame.origin.y, visibleFrame.minY + 8),
                visibleFrame.maxY - frame.height - 8
            )
        }
        panel.setFrame(frame, display: panel.isVisible, animate: panel.isVisible)
    }
}
