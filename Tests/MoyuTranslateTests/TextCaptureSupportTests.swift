import CoreGraphics
import Testing
@testable import MoyuTranslate

struct TextCaptureSupportTests {
    @Test func extractsWordAtUTF16Offset() {
        #expect(TextCaptureService.word(in: "hello serendipity world", utf16Offset: 9) == "serendipity")
    }

    @Test func sanitizesOCRPunctuation() {
        #expect(TextCaptureService.sanitize("  (hover),  ") == "hover")
    }

    @Test func coordinateConversion() {
        #expect(
            ScreenCoordinateConverter.appKitPoint(fromQuartz: CGPoint(x: 100, y: 200), primaryScreenHeight: 1_000)
                == CGPoint(x: 100, y: 800)
        )
    }
}
