import AppKit

let canvasSize = 36
let output = CommandLine.arguments.dropFirst().first
    ?? "apps/desktop/src-tauri/icons/trayTemplate.png"

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: canvasSize,
    pixelsHigh: canvasSize,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    fatalError("Unable to create tray icon bitmap")
}

NSGraphicsContext.saveGraphicsState()
let context = NSGraphicsContext(bitmapImageRep: bitmap)
context?.shouldAntialias = true
NSGraphicsContext.current = context
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: canvasSize, height: canvasSize).fill(using: .copy)
NSColor.black.setStroke()
NSColor.black.setFill()

let head = NSBezierPath()
head.move(to: NSPoint(x: 18, y: 5.5))
head.curve(to: NSPoint(x: 5, y: 17), controlPoint1: NSPoint(x: 10, y: 5.5), controlPoint2: NSPoint(x: 5, y: 9))
head.curve(to: NSPoint(x: 10, y: 27), controlPoint1: NSPoint(x: 5, y: 22), controlPoint2: NSPoint(x: 7, y: 25))
head.line(to: NSPoint(x: 9, y: 33))
head.line(to: NSPoint(x: 15, y: 29))
head.curve(to: NSPoint(x: 21, y: 29), controlPoint1: NSPoint(x: 17, y: 29.8), controlPoint2: NSPoint(x: 19, y: 29.8))
head.line(to: NSPoint(x: 27, y: 33))
head.line(to: NSPoint(x: 26, y: 27))
head.curve(to: NSPoint(x: 31, y: 17), controlPoint1: NSPoint(x: 29, y: 25), controlPoint2: NSPoint(x: 31, y: 22))
head.curve(to: NSPoint(x: 18, y: 5.5), controlPoint1: NSPoint(x: 31, y: 9), controlPoint2: NSPoint(x: 26, y: 5.5))
head.close()
head.lineWidth = 2.4
head.lineCapStyle = .round
head.lineJoinStyle = .round
head.stroke()

for x in [12.5, 23.5] {
    NSBezierPath(ovalIn: NSRect(x: x - 1.35, y: 18, width: 2.7, height: 2.7)).fill()
}

let fishBody = NSBezierPath(ovalIn: NSRect(x: 10.5, y: 8.5, width: 13, height: 6.5))
fishBody.lineWidth = 2
fishBody.stroke()

let fishTail = NSBezierPath()
fishTail.move(to: NSPoint(x: 23, y: 11.75))
fishTail.line(to: NSPoint(x: 29, y: 15.5))
fishTail.line(to: NSPoint(x: 29, y: 8))
fishTail.close()
fishTail.lineWidth = 2
fishTail.lineCapStyle = .round
fishTail.lineJoinStyle = .round
fishTail.stroke()

NSBezierPath(ovalIn: NSRect(x: 13, y: 11, width: 1.5, height: 1.5)).fill()
NSGraphicsContext.restoreGraphicsState()

guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode tray icon PNG")
}
try data.write(to: URL(fileURLWithPath: output))
