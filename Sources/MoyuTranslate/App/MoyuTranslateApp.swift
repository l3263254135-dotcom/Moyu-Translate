import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let controller = AppController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        controller.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        controller.stop()
    }
}

@main
struct MoyuTranslateApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        MenuBarExtra {
            MenuBarContent(controller: appDelegate.controller)
        } label: {
            Image(nsImage: MenuBarIconLoader.image)
                .accessibilityLabel("Moyu Translate")
        }

        Settings {
            SettingsView(
                preferences: appDelegate.controller.preferences,
                permissions: appDelegate.controller.permissions,
                appleTranslation: appDelegate.controller.appleTranslation
            )
        }
    }
}

private struct MenuBarContent: View {
    let controller: AppController

    var body: some View {
        Button {
            controller.openPanel()
        } label: {
            Label("打开翻译窗", systemImage: "character.bubble")
        }

        Toggle("启用 Option 长按", isOn: Bindable(controller.preferences).isEnabled)
        Divider()
        SettingsLink {
            Label("设置", systemImage: "gearshape")
        }
        Button {
            NSApplication.shared.terminate(nil)
        } label: {
            Label("退出 Moyu Translate", systemImage: "power")
        }
        .keyboardShortcut("q")
    }
}

enum MenuBarIconLoader {
    static let image: NSImage = {
        if let url = ResourceLocator.url(forResource: "MenuBarIcon", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            image.size = NSSize(width: 18, height: 18)
            image.isTemplate = true
            return image
        }
        return NSImage(systemSymbolName: "cat.fill", accessibilityDescription: "Moyu Translate")
            ?? NSImage(size: NSSize(width: 18, height: 18))
    }()
}
