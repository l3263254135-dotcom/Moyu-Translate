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
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if let partOfSpeech = result.partOfSpeech {
                        Text(partOfSpeech)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(palette.accent)
                    }
                    Text(result.primaryText)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(palette.text)
                        .textSelection(.enabled)
                    Spacer(minLength: 6)
                }

                if !result.vocabularyTags.isEmpty {
                    ScrollView(.horizontal) {
                        HStack(spacing: 5) {
                            ForEach(result.vocabularyTags, id: \.self) { tag in
                                Text(tag)
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundStyle(palette.accent)
                                    .padding(.horizontal, 6)
                                    .frame(height: 18)
                                    .background(
                                        RoundedRectangle(cornerRadius: 4)
                                            .fill(palette.accent.opacity(0.11))
                                    )
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .frame(height: 18)
                }

                if !result.alternatives.isEmpty {
                    disclosureRow(
                        title: "其他释义",
                        detail: "\(result.alternatives.count)",
                        isExpanded: model.isExpanded
                    ) {
                        withAnimation(.easeOut(duration: 0.16)) { model.isExpanded.toggle() }
                    }

                    if model.isExpanded {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(result.alternatives.enumerated()), id: \.offset) { index, meaning in
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    Text("\(index + 2)")
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundStyle(palette.accent)
                                        .frame(width: 16, alignment: .trailing)
                                    Text(meaning)
                                        .font(.system(size: 13))
                                        .foregroundStyle(palette.secondaryText)
                                        .textSelection(.enabled)
                                }
                            }
                        }
                        .padding(.leading, 2)
                    }
                }

                if !result.dictionarySections.isEmpty {
                    disclosureRow(
                        title: "系统词典",
                        detail: "\(result.dictionarySections.count)",
                        isExpanded: model.isDictionaryExpanded
                    ) {
                        withAnimation(.easeOut(duration: 0.16)) { model.isDictionaryExpanded.toggle() }
                    }

                    if model.isDictionaryExpanded {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(Array(result.dictionarySections.enumerated()), id: \.offset) { _, section in
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(section.title)
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundStyle(palette.accent)
                                        ForEach(section.entries, id: \.self) { entry in
                                            Text(entry)
                                                .font(.system(size: 12))
                                                .foregroundStyle(palette.secondaryText)
                                                .textSelection(.enabled)
                                                .frame(maxWidth: .infinity, alignment: .leading)
                                        }
                                    }
                                }
                            }
                        }
                        .frame(maxHeight: 160)
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

    private func disclosureRow(
        title: String,
        detail: String,
        isExpanded: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .frame(width: 10)
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                Spacer()
                Text(detail)
                    .font(.system(size: 10))
            }
            .foregroundStyle(palette.secondaryText)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 2)
        .accessibilityValue(isExpanded ? "已展开" : "已折叠")
    }
}
