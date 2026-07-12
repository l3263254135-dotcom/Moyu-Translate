import ApplicationServices
import CoreGraphics
import Foundation
import Observation

@MainActor
@Observable
final class PermissionManager {
    private(set) var accessibilityGranted = false
    private(set) var screenRecordingGranted = false

    init() {
        refresh()
    }

    func refresh() {
        accessibilityGranted = AXIsProcessTrusted()
        screenRecordingGranted = CGPreflightScreenCaptureAccess()
    }

    func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        accessibilityGranted = AXIsProcessTrustedWithOptions(options)
    }

    func requestScreenRecording() {
        screenRecordingGranted = CGRequestScreenCaptureAccess()
    }
}
