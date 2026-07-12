import SwiftUI
import Translation

struct FloatingPanelView: View {
    @Bindable var model: AppModel
    @FocusState private var inputFocused: Bool

    private var palette: ThemePalette {
        ThemePalette.palette(for: model.preferences.theme)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)
            content
        }
        .frame(width: 400)
        .fixedSize(horizontal: false, vertical: true)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(palette.background.opacity(0.98))
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(palette.separator, lineWidth: 1)
        )
        .shadow(color: .black.opacity(model.preferences.theme == .light ? 0.18 : 0.38), radius: 24, y: 12)
        .environment(model.preferences)
        .preferredColorScheme(model.preferences.theme == .light ? .light : .dark)
        .onAppear { inputFocused = true }
        .onChange(of: model.focusRequestID) { _, _ in inputFocused = true }
        .onExitCommand { model.dismiss() }
        .translationTask(model.appleTranslation.configuration) { session in
            await model.appleTranslation.handle(session: session)
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(nsImage: MenuBarIconLoader.image)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 16, height: 16)
                .foregroundStyle(palette.accent)
                .accessibilityHidden(true)
            Text("Moyu Translate")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(palette.text)
            Spacer(minLength: 12)
            IconToolButton(systemName: "scope", help: "从呼出时的光标位置取词") {
                model.captureAtAnchor()
            }
            IconToolButton(
                systemName: model.preferences.theme == .light ? "moon.fill" : "sun.max.fill",
                help: model.preferences.theme == .light ? "切换夜间模式" : "切换日间模式"
            ) {
                model.toggleTheme()
            }
            IconToolButton(
                systemName: model.preferences.isPinned ? "pin.fill" : "pin",
                help: model.preferences.isPinned ? "取消固定悬浮窗" : "固定悬浮窗",
                isActive: model.preferences.isPinned
            ) {
                model.togglePinned()
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 42)
        .contentShape(Rectangle())
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("输入英文或中文", text: $model.query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14))
                    .foregroundStyle(palette.text)
                    .focused($inputFocused)
                    .onSubmit { Task { await model.submit() } }
                    .padding(.horizontal, 11)
                    .frame(height: 38)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(palette.elevated)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(inputFocused ? palette.accent : palette.separator, lineWidth: inputFocused ? 2 : 1)
                    )

                Button {
                    Task { await model.submit() }
                } label: {
                    Image(systemName: "arrow.turn.down.left")
                        .font(.system(size: 14, weight: .bold))
                        .frame(width: 38, height: 38)
                        .foregroundStyle(model.preferences.theme == .light ? Color.white : Color(red: 0.14, green: 0.11, blue: 0.08))
                        .background(RoundedRectangle(cornerRadius: 8).fill(palette.accent))
                }
                .buttonStyle(.plain)
                .help("翻译")
                .accessibilityLabel("翻译")
            }

            statusLine
            resultArea
        }
        .padding(14)
    }

    @ViewBuilder
    private var statusLine: some View {
        let direction = try? LanguageResolver.direction(for: model.query, preference: model.preferences.direction)
        HStack(spacing: 5) {
            if let direction {
                Text("\(direction.0.shortLabel) → \(direction.1.shortLabel)")
            } else {
                Text(model.preferences.direction.label)
            }
            Text("· 本地")
            if model.isWorking {
                ProgressView().controlSize(.mini)
            }
            Spacer()
            if let result = model.result {
                Text("\(result.provider) · \(result.latencyMilliseconds)ms")
            }
        }
        .font(.system(size: 10))
        .foregroundStyle(palette.secondaryText)
        .frame(height: 12)
    }

    @ViewBuilder
    private var resultArea: some View {
        if let error = model.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color(red: 0.80, green: 0.29, blue: 0.24))
                .lineLimit(2)
                .frame(maxWidth: .infinity, minHeight: 30, alignment: .leading)
        } else if let result = model.result {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(result.visibleMeanings(expanded: model.isExpanded).enumerated()), id: \.offset) { index, meaning in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        if index == 0, let partOfSpeech = result.partOfSpeech {
                            Text(partOfSpeech)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(palette.accent)
                        } else if result.partOfSpeech != nil {
                            Color.clear.frame(width: 20, height: 1)
                        }
                        Text(meaning)
                            .font(.system(size: index == 0 ? 15 : 13, weight: index == 0 ? .medium : .regular))
                            .foregroundStyle(index == 0 ? palette.text : palette.secondaryText)
                            .textSelection(.enabled)
                        Spacer(minLength: 6)
                        if index == 0, !result.alternatives.isEmpty {
                            Button {
                                withAnimation(.easeOut(duration: 0.16)) { model.isExpanded.toggle() }
                            } label: {
                                Image(systemName: model.isExpanded ? "chevron.up" : "chevron.down")
                                    .font(.system(size: 10, weight: .bold))
                                    .frame(width: 24, height: 24)
                                    .background(Circle().fill(palette.separator.opacity(0.6)))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(palette.secondaryText)
                            .help(model.isExpanded ? "收起释义" : "展开更多释义")
                        }
                    }
                }
            }
            .contextMenu {
                Button("复制译文") { model.copyPrimaryResult() }
            }
            .frame(maxWidth: .infinity, minHeight: 30, alignment: .leading)
        } else {
            Text("输入内容后按回车，或点击准星读取光标处文字")
                .font(.system(size: 12))
                .foregroundStyle(palette.secondaryText)
                .frame(maxWidth: .infinity, minHeight: 30, alignment: .leading)
        }
    }
}
