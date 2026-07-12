import AppKit
import CoreGraphics
import Foundation
import OSLog

@MainActor
final class OptionHoldMonitor {
    private let logger = Logger(subsystem: "com.l3263254135.moyutranslate", category: "Hotkey")
    private let threshold: TimeInterval
    private let onTrigger: (CGPoint) -> Void
    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var triggerWorkItem: DispatchWorkItem?
    private var optionIsDown = false

    init(threshold: TimeInterval = 0.35, onTrigger: @escaping (CGPoint) -> Void) {
        self.threshold = threshold
        self.onTrigger = onTrigger
    }

    func start() {
        stop()
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged, .keyDown]) { [weak self] event in
            Task { @MainActor in self?.handle(event) }
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown]) { [weak self] event in
            self?.handle(event)
            return event
        }
        logger.info("Option hold monitor started")
    }

    func stop() {
        if let globalMonitor { NSEvent.removeMonitor(globalMonitor) }
        if let localMonitor { NSEvent.removeMonitor(localMonitor) }
        globalMonitor = nil
        localMonitor = nil
        cancelPendingTrigger()
    }

    private func handle(_ event: NSEvent) {
        if event.type == .keyDown {
            cancelPendingTrigger()
            return
        }

        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let optionOnly = flags.contains(.option)
            && !flags.contains(.command)
            && !flags.contains(.control)
            && !flags.contains(.shift)

        if optionOnly, !optionIsDown {
            optionIsDown = true
            scheduleTrigger()
        } else if !flags.contains(.option) {
            optionIsDown = false
            cancelPendingTrigger(resetPressedState: false)
        }
    }

    private func scheduleTrigger() {
        triggerWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self, self.optionIsDown else { return }
                let point = CGEvent(source: nil)?.location ?? NSEvent.mouseLocation
                self.logger.info("Option hold triggered")
                self.onTrigger(point)
            }
        }
        triggerWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + threshold, execute: workItem)
    }

    private func cancelPendingTrigger(resetPressedState: Bool = true) {
        triggerWorkItem?.cancel()
        triggerWorkItem = nil
        if resetPressedState { optionIsDown = false }
    }
}
