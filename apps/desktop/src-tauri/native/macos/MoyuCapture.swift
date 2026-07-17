import ApplicationServices
import CoreGraphics
import Foundation
import ScreenCaptureKit
import Vision

private struct CaptureOutput: Encodable {
    let text: String
    let origin: String
}

private enum CaptureError: LocalizedError {
    case invalidArguments
    case screenPermission
    case noDisplay
    case noText

    var errorDescription: String? {
        switch self {
        case .invalidArguments: "取词助手没有收到有效的光标坐标。"
        case .screenPermission: "需要屏幕录制权限才能识别图片、视频或游戏文字。"
        case .noDisplay: "没有找到光标所在的显示器。"
        case .noText: "没有识别到光标附近的文字。"
        }
    }
}

@main
private struct MoyuCapture {
    static func main() async {
        do {
            guard CommandLine.arguments.count == 3,
                  let x = Double(CommandLine.arguments[1]),
                  let y = Double(CommandLine.arguments[2]) else {
                throw CaptureError.invalidArguments
            }
            let point = CGPoint(x: x, y: y)
            let output: CaptureOutput
            if AXIsProcessTrusted(), let text = accessibilityText(at: point) {
                output = CaptureOutput(text: text, origin: "accessibility")
            } else {
                guard CGPreflightScreenCaptureAccess() else { throw CaptureError.screenPermission }
                let screenshot = try await screenshot(around: point)
                guard let text = try recognizeNearestText(in: screenshot.image, target: screenshot.target) else {
                    throw CaptureError.noText
                }
                output = CaptureOutput(text: text, origin: "ocr")
            }
            let data = try JSONEncoder().encode(output)
            FileHandle.standardOutput.write(data)
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            Foundation.exit(1)
        }
    }

    private static func accessibilityText(at point: CGPoint) -> String? {
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
        return word(in: text, utf16Offset: range.location)
    }

    private static func screenshot(around point: CGPoint) async throws -> (image: CGImage, target: CGPoint) {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.frame.contains(point) }) else {
            throw CaptureError.noDisplay
        }
        var crop = CGRect(x: point.x - 280, y: point.y - 120, width: 560, height: 240)
        crop = crop.intersection(display.frame)
        guard !crop.isNull, crop.width > 1, crop.height > 1 else { throw CaptureError.noDisplay }

        let scale = display.frame.width > 0 ? CGFloat(display.width) / display.frame.width : 2
        let configuration = SCStreamConfiguration()
        configuration.sourceRect = CGRect(
            x: crop.minX - display.frame.minX,
            y: crop.minY - display.frame.minY,
            width: crop.width,
            height: crop.height
        )
        configuration.width = max(1, Int(crop.width * scale))
        configuration.height = max(1, Int(crop.height * scale))
        configuration.showsCursor = false
        configuration.capturesAudio = false
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
        return (
            image,
            CGPoint(x: (point.x - crop.minX) * scale, y: (point.y - crop.minY) * scale)
        )
    }

    private static func recognizeNearestText(in image: CGImage, target: CGPoint) throws -> String? {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US", "zh-Hans"]
        request.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: image).perform([request])

        let normalizedTarget = CGPoint(
            x: target.x / CGFloat(image.width),
            y: 1 - target.y / CGFloat(image.height)
        )
        var best: (text: String, distance: CGFloat)?
        for observation in request.results ?? [] {
            guard let candidate = observation.topCandidates(1).first else { continue }
            var ranges: [Range<String.Index>] = []
            candidate.string.enumerateSubstrings(
                in: candidate.string.startIndex..<candidate.string.endIndex,
                options: [.byWords, .substringNotRequired]
            ) { _, range, _, _ in ranges.append(range) }
            if ranges.isEmpty {
                let distance = distance(from: normalizedTarget, to: observation.boundingBox)
                if best == nil || distance < best!.distance { best = (candidate.string, distance) }
                continue
            }
            for range in ranges {
                guard let box = try? candidate.boundingBox(for: range) else { continue }
                let distance = distance(from: normalizedTarget, to: box.boundingBox)
                if best == nil || distance < best!.distance {
                    best = (String(candidate.string[range]), distance)
                }
            }
        }
        return best.map { sanitize($0.text) }.flatMap { $0.isEmpty ? nil : $0 }
    }

    private static func distance(from point: CGPoint, to rect: CGRect) -> CGFloat {
        let dx = max(rect.minX - point.x, 0, point.x - rect.maxX)
        let dy = max(rect.minY - point.y, 0, point.y - rect.maxY)
        return hypot(dx, dy)
    }

    private static func word(in text: String, utf16Offset: Int) -> String? {
        let offset = min(max(0, utf16Offset), text.utf16.count)
        let target = String.Index(utf16Offset: offset, in: text)
        var match: String?
        text.enumerateSubstrings(in: text.startIndex..<text.endIndex, options: .byWords) { substring, range, _, stop in
            if range.contains(target) || range.upperBound == target {
                match = substring
                stop = true
            }
        }
        return match.map(sanitize).flatMap { $0.isEmpty ? nil : $0 }
    }

    private static func sanitize(_ text: String) -> String {
        text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
    }
}
