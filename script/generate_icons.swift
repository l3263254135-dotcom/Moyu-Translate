#!/usr/bin/env swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let assets = root.appendingPathComponent("Assets", isDirectory: true)
let resources = root.appendingPathComponent("Sources/MoyuTranslate/Resources", isDirectory: true)
try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: resources, withIntermediateDirectories: true)

extension NSBezierPath {
    func stroke(color: NSColor, width: CGFloat) {
        color.setStroke()
        lineWidth = width
        lineCapStyle = .round
        lineJoinStyle = .round
        stroke()
    }

    func fill(color: NSColor) {
        color.setFill()
        fill()
    }
}

func oval(_ rect: NSRect, fill: NSColor, stroke: NSColor? = nil, width: CGFloat = 0) {
    let path = NSBezierPath(ovalIn: rect)
    path.fill(color: fill)
    if let stroke { path.stroke(color: stroke, width: width) }
}

func line(_ points: [NSPoint], color: NSColor, width: CGFloat) {
    guard let first = points.first else { return }
    let path = NSBezierPath()
    path.move(to: first)
    for point in points.dropFirst() { path.line(to: point) }
    path.stroke(color: color, width: width)
}

func triangle(_ a: NSPoint, _ b: NSPoint, _ c: NSPoint, fill: NSColor, stroke: NSColor, width: CGFloat) {
    let path = NSBezierPath()
    path.move(to: a)
    path.line(to: b)
    path.line(to: c)
    path.close()
    path.fill(color: fill)
    path.stroke(color: stroke, width: width)
}

func pngData(from image: NSImage) throws -> Data {
    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "IconGenerator", code: 1)
    }
    return png
}

func drawAppIcon() -> NSImage {
    let image = NSImage(size: NSSize(width: 1024, height: 1024))
    image.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high

    let ink = NSColor(calibratedRed: 0.13, green: 0.12, blue: 0.11, alpha: 1)
    let warmWhite = NSColor(calibratedRed: 1.0, green: 0.985, blue: 0.95, alpha: 1)
    let catWhite = NSColor(calibratedRed: 1.0, green: 0.998, blue: 0.985, alpha: 1)
    let pink = NSColor(calibratedRed: 1.0, green: 0.57, blue: 0.58, alpha: 1)
    let fishGold = NSColor(calibratedRed: 1.0, green: 0.70, blue: 0.16, alpha: 1)
    let fishLight = NSColor(calibratedRed: 1.0, green: 0.86, blue: 0.42, alpha: 1)
    let fishOrange = NSColor(calibratedRed: 0.95, green: 0.48, blue: 0.16, alpha: 1)

    let background = NSBezierPath(roundedRect: NSRect(x: 32, y: 32, width: 960, height: 960), xRadius: 220, yRadius: 220)
    background.fill(color: warmWhite)

    triangle(NSPoint(x: 274, y: 686), NSPoint(x: 342, y: 900), NSPoint(x: 450, y: 748), fill: catWhite, stroke: ink, width: 20)
    triangle(NSPoint(x: 574, y: 748), NSPoint(x: 688, y: 900), NSPoint(x: 750, y: 680), fill: catWhite, stroke: ink, width: 20)
    triangle(NSPoint(x: 308, y: 710), NSPoint(x: 347, y: 838), NSPoint(x: 414, y: 743), fill: pink.withAlphaComponent(0.62), stroke: pink, width: 10)
    triangle(NSPoint(x: 610, y: 743), NSPoint(x: 681, y: 838), NSPoint(x: 718, y: 704), fill: pink.withAlphaComponent(0.62), stroke: pink, width: 10)
    oval(NSRect(x: 218, y: 330, width: 588, height: 500), fill: catWhite, stroke: ink, width: 20)

    oval(NSRect(x: 338, y: 590, width: 92, height: 112), fill: ink)
    oval(NSRect(x: 594, y: 590, width: 92, height: 112), fill: ink)
    oval(NSRect(x: 360, y: 656, width: 30, height: 38), fill: .white)
    oval(NSRect(x: 385, y: 625, width: 14, height: 18), fill: .white)
    oval(NSRect(x: 616, y: 656, width: 30, height: 38), fill: .white)
    oval(NSRect(x: 641, y: 625, width: 14, height: 18), fill: .white)
    oval(NSRect(x: 482, y: 564, width: 60, height: 42), fill: pink, stroke: ink, width: 9)
    line([NSPoint(x: 512, y: 563), NSPoint(x: 512, y: 540), NSPoint(x: 486, y: 520)], color: ink, width: 9)
    line([NSPoint(x: 512, y: 540), NSPoint(x: 538, y: 520)], color: ink, width: 9)

    for y in [524.0, 493.0] {
        line([NSPoint(x: 230, y: y), NSPoint(x: 320, y: y - 20)], color: ink, width: 10)
        line([NSPoint(x: 704, y: y - 20), NSPoint(x: 794, y: y)], color: ink, width: 10)
    }
    for x in [300.0, 327.0, 654.0, 681.0] {
        line([NSPoint(x: x, y: 565), NSPoint(x: x + 18, y: 551)], color: pink, width: 10)
    }

    let fishBody = NSBezierPath(ovalIn: NSRect(x: 194, y: 210, width: 610, height: 280))
    fishBody.fill(color: fishGold)
    fishBody.stroke(color: ink, width: 20)
    let fishBelly = NSBezierPath()
    fishBelly.move(to: NSPoint(x: 265, y: 302))
    fishBelly.curve(to: NSPoint(x: 700, y: 276), controlPoint1: NSPoint(x: 380, y: 220), controlPoint2: NSPoint(x: 585, y: 220))
    fishBelly.stroke(color: fishLight, width: 34)
    triangle(NSPoint(x: 772, y: 350), NSPoint(x: 914, y: 474), NSPoint(x: 906, y: 230), fill: fishOrange, stroke: ink, width: 20)
    oval(NSRect(x: 255, y: 364, width: 46, height: 46), fill: NSColor(calibratedRed: 0.79, green: 0.18, blue: 0.17, alpha: 1), stroke: ink, width: 7)
    oval(NSRect(x: 269, y: 390, width: 12, height: 12), fill: .white)
    let gill = NSBezierPath()
    gill.move(to: NSPoint(x: 350, y: 425))
    gill.curve(to: NSPoint(x: 350, y: 285), controlPoint1: NSPoint(x: 305, y: 380), controlPoint2: NSPoint(x: 305, y: 330))
    gill.stroke(color: ink, width: 12)
    triangle(NSPoint(x: 512, y: 478), NSPoint(x: 584, y: 540), NSPoint(x: 626, y: 464), fill: fishOrange, stroke: ink, width: 14)

    oval(NSRect(x: 304, y: 254, width: 156, height: 126), fill: catWhite, stroke: ink, width: 18)
    oval(NSRect(x: 614, y: 254, width: 156, height: 126), fill: catWhite, stroke: ink, width: 18)

    image.unlockFocus()
    return image
}

func drawMenuIcon() -> NSImage {
    let image = NSImage(size: NSSize(width: 72, height: 72))
    image.lockFocus()
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: 72, height: 72).fill()
    let ink = NSColor.black
    triangle(NSPoint(x: 13, y: 45), NSPoint(x: 19, y: 64), NSPoint(x: 30, y: 50), fill: .clear, stroke: ink, width: 4)
    triangle(NSPoint(x: 42, y: 50), NSPoint(x: 53, y: 64), NSPoint(x: 59, y: 45), fill: .clear, stroke: ink, width: 4)
    oval(NSRect(x: 10, y: 18, width: 52, height: 42), fill: .clear, stroke: ink, width: 4)
    oval(NSRect(x: 21, y: 41, width: 7, height: 9), fill: ink)
    oval(NSRect(x: 44, y: 41, width: 7, height: 9), fill: ink)
    let fish = NSBezierPath(ovalIn: NSRect(x: 16, y: 10, width: 43, height: 19))
    fish.stroke(color: ink, width: 4)
    triangle(NSPoint(x: 57, y: 20), NSPoint(x: 68, y: 29), NSPoint(x: 68, y: 11), fill: .clear, stroke: ink, width: 4)
    image.unlockFocus()
    image.isTemplate = true
    return image
}

let appIcon = drawAppIcon()
let menuIcon = drawMenuIcon()
try pngData(from: appIcon).write(to: assets.appendingPathComponent("IconSource.png"))
try pngData(from: menuIcon).write(to: resources.appendingPathComponent("MenuBarIcon.png"))
print("Generated Assets/IconSource.png and MenuBarIcon.png")
