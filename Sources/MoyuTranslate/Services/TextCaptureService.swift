import ApplicationServices
import CoreGraphics
import Foundation
import ScreenCaptureKit
import Vision

final class TextCaptureService: @unchecked Sendable {
    private let cropSize = CGSize(width: 560, height: 240)

    func capture(at quartzPoint: CGPoint) async throws -> CapturedText {
        if AXIsProcessTrusted(), let accessibleText = accessibilityText(at: quartzPoint) {
            return CapturedText(text: accessibleText, origin: .accessibility)
        }

        guard CGPreflightScreenCaptureAccess() else {
            throw TranslationFailure.screenRecordingPermissionRequired
        }
        let screenshot = try await screenshot(around: quartzPoint)
        let text = try await Self.recognizeNearestText(
            in: screenshot.image,
            target: screenshot.targetInImage
        )
        guard let text, !text.isEmpty else { throw TranslationFailure.noTextFound }
        return CapturedText(text: text, origin: .ocr)
    }

    private func accessibilityText(at point: CGPoint) -> String? {
        let systemWide = AXUIElementCreateSystemWide()
        var element: AXUIElement?
        guard AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &element) == .success,
              let element else { return nil }

        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &value) == .success,
              let text = value as? String,
              !text.isEmpty else { return nil }

        var pointValue = point
        guard let axPoint = AXValueCreate(.cgPoint, &pointValue) else { return nil }
        var rangeValue: CFTypeRef?
        guard AXUIElementCopyParameterizedAttributeValue(
            element,
            kAXRangeForPositionParameterizedAttribute as CFString,
            axPoint,
            &rangeValue
        ) == .success,
        let rangeValue,
        CFGetTypeID(rangeValue) == AXValueGetTypeID() else { return nil }
        let axRange: AXValue = unsafeBitCast(rangeValue, to: AXValue.self)
        guard AXValueGetType(axRange) == .cfRange else { return nil }

        var range = CFRange()
        guard AXValueGetValue(axRange, .cfRange, &range), range.location >= 0 else { return nil }
        return Self.word(in: text, utf16Offset: range.location)
    }

    private func screenshot(around point: CGPoint) async throws -> (image: CGImage, targetInImage: CGPoint) {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.frame.contains(point) }) else {
            throw TranslationFailure.noTextFound
        }

        var crop = CGRect(
            x: point.x - cropSize.width / 2,
            y: point.y - cropSize.height / 2,
            width: cropSize.width,
            height: cropSize.height
        )
        crop = crop.intersection(display.frame)
        guard !crop.isNull, crop.width > 1, crop.height > 1 else {
            throw TranslationFailure.noTextFound
        }

        let configuration = SCStreamConfiguration()
        configuration.sourceRect = CGRect(
            x: crop.minX - display.frame.minX,
            y: crop.minY - display.frame.minY,
            width: crop.width,
            height: crop.height
        )
        let scale = display.frame.width > 0 ? CGFloat(display.width) / display.frame.width : 2
        configuration.width = max(1, Int(crop.width * scale))
        configuration.height = max(1, Int(crop.height * scale))
        configuration.showsCursor = false
        configuration.capturesAudio = false

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let image = try await SCScreenshotManager.captureImage(
            contentFilter: filter,
            configuration: configuration
        )
        let target = CGPoint(
            x: (point.x - crop.minX) * scale,
            y: (point.y - crop.minY) * scale
        )
        return (image, target)
    }

    static func recognizeNearestText(in image: CGImage, target: CGPoint) async throws -> String? {
        try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US", "zh-Hans"]
            request.usesLanguageCorrection = true
            let handler = VNImageRequestHandler(cgImage: image, options: [:])
            try handler.perform([request])

            let normalizedTarget = CGPoint(
                x: target.x / CGFloat(image.width),
                y: 1 - target.y / CGFloat(image.height)
            )
            var best: (text: String, distance: CGFloat)?

            for observation in request.results ?? [] {
                guard let candidate = observation.topCandidates(1).first else { continue }
                let words = Self.wordRanges(in: candidate.string)
                if words.isEmpty {
                    let distance = ScreenCoordinateConverter.distance(from: normalizedTarget, to: observation.boundingBox)
                    if best == nil || distance < best!.distance {
                        best = (candidate.string, distance)
                    }
                    continue
                }

                for range in words {
                    guard let box = try? candidate.boundingBox(for: range) else { continue }
                    let distance = ScreenCoordinateConverter.distance(from: normalizedTarget, to: box.boundingBox)
                    let value = String(candidate.string[range])
                    if best == nil || distance < best!.distance {
                        best = (value, distance)
                    }
                }
            }
            return best.map { Self.sanitize($0.text) }.flatMap { $0.isEmpty ? nil : $0 }
        }.value
    }

    static func word(in text: String, utf16Offset: Int) -> String? {
        let boundedOffset = min(max(0, utf16Offset), text.utf16.count)
        let target = String.Index(utf16Offset: boundedOffset, in: text)
        var match: String?
        text.enumerateSubstrings(in: text.startIndex..<text.endIndex, options: .byWords) { substring, range, _, stop in
            if range.contains(target) || range.upperBound == target {
                match = substring
                stop = true
            }
        }
        return match.map(sanitize).flatMap { $0.isEmpty ? nil : $0 }
    }

    static func wordRanges(in text: String) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        text.enumerateSubstrings(in: text.startIndex..<text.endIndex, options: [.byWords, .substringNotRequired]) {
            _, range, _, _ in ranges.append(range)
        }
        return ranges
    }

    static func sanitize(_ text: String) -> String {
        text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
    }
}
