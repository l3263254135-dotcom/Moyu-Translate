import CoreGraphics

enum ScreenCoordinateConverter {
    static func appKitPoint(fromQuartz point: CGPoint, primaryScreenHeight: CGFloat) -> CGPoint {
        CGPoint(x: point.x, y: primaryScreenHeight - point.y)
    }

    static func distance(from point: CGPoint, to rect: CGRect) -> CGFloat {
        let closestX = min(max(point.x, rect.minX), rect.maxX)
        let closestY = min(max(point.y, rect.minY), rect.maxY)
        return hypot(point.x - closestX, point.y - closestY)
    }
}
