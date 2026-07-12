import Foundation

enum ResourceLocator {
    static func url(forResource name: String, withExtension extensionName: String) -> URL? {
        if let bundled = Bundle.main.url(forResource: name, withExtension: extensionName) {
            return bundled
        }
        let developmentURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("Sources/MoyuTranslate/Resources")
            .appendingPathComponent("\(name).\(extensionName)")
        return FileManager.default.fileExists(atPath: developmentURL.path) ? developmentURL : nil
    }
}
