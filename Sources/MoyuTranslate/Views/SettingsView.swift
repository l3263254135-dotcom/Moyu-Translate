import ServiceManagement
import SwiftUI

struct SettingsView: View {
    @Bindable var preferences: PreferencesStore
    @Bindable var permissions: PermissionManager
    let appleTranslation: AppleTranslationService

    var body: some View {
        Form {
            Section("常规") {
                Toggle("启用 Option 长按呼出", isOn: $preferences.isEnabled)
                Toggle("登录时启动", isOn: $preferences.launchAtLogin)
                    .onChange(of: preferences.launchAtLogin) { _, enabled in
                        updateLaunchAtLogin(enabled)
                    }
                Picker("翻译方向", selection: $preferences.direction) {
                    ForEach(LanguageDirection.allCases) { direction in
                        Text(direction.label).tag(direction)
                    }
                }
            }

            Section("外观") {
                Picker("主题", selection: $preferences.theme) {
                    ForEach(AppTheme.allCases) { theme in
                        Text(theme.label).tag(theme)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section("系统权限") {
                permissionRow(
                    title: "辅助功能",
                    granted: permissions.accessibilityGranted,
                    action: permissions.requestAccessibility
                )
                permissionRow(
                    title: "屏幕录制",
                    granted: permissions.screenRecordingGranted,
                    action: permissions.requestScreenRecording
                )
                Text("修改权限后可能需要重新启动 Moyu Translate。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("离线翻译") {
                LabeledContent("ECDICT", value: "内置")
                LabeledContent("Apple Translation", value: appleTranslation.statusText)
            }

            Section("词典来源") {
                Toggle("ECDICT 开放词典", isOn: $preferences.usesECDICT)
                Toggle("macOS 系统词典", isOn: $preferences.usesSystemDictionary)
                Toggle("考试词汇标签", isOn: $preferences.showsExamTags)
                Text("系统词典读取“词典”App 中已启用的本地内容；可用词典因 macOS 版本和用户设置而异。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding(16)
        .frame(width: 500, height: 530)
        .onAppear { permissions.refresh() }
    }

    private func permissionRow(title: String, granted: Bool, action: @escaping () -> Void) -> some View {
        HStack {
            Label(title, systemImage: granted ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .foregroundStyle(granted ? Color.green : Color.orange)
            Spacer()
            if !granted {
                Button("前往授权", action: action)
            }
        }
    }

    private func updateLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            preferences.launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }
}
