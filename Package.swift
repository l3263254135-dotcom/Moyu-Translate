// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MoyuTranslate",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "MoyuTranslate", targets: ["MoyuTranslate"])
    ],
    targets: [
        .executableTarget(
            name: "MoyuTranslate",
            exclude: ["Resources"],
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .testTarget(
            name: "MoyuTranslateTests",
            dependencies: ["MoyuTranslate"],
            swiftSettings: [
                .unsafeFlags([
                    "-F", "/Library/Developer/CommandLineTools/Library/Developer/Frameworks",
                    "-plugin-path", "/Library/Developer/CommandLineTools/usr/lib/swift/host/plugins/testing"
                ])
            ],
            linkerSettings: [
                .linkedFramework("Testing"),
                .unsafeFlags([
                    "-F", "/Library/Developer/CommandLineTools/Library/Developer/Frameworks",
                    "-Xlinker", "-rpath",
                    "-Xlinker", "/Library/Developer/CommandLineTools/Library/Developer/Frameworks",
                    "-Xlinker", "-rpath",
                    "-Xlinker", "/Library/Developer/CommandLineTools/Library/Developer/usr/lib"
                ])
            ]
        )
    ],
    swiftLanguageModes: [.v5]
)
