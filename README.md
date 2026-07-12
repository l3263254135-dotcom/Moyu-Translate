# Moyu Translate

Moyu Translate 是一款原生 macOS 菜单栏翻译工具。长按 Option 约 350ms 即可在光标附近呼出输入框；日常以手动输入为主，需要读取图片、视频或游戏中的文字时，点击准星按钮即可识别呼出时的光标位置。

![Moyu Translate app icon](Assets/IconSource.png)

## 功能

- macOS 15+，Apple Silicon 与 Intel 通用构建
- 58,000+ 常用英文词条使用内置精简 ECDICT，未命中时自动回退到 Apple 本地翻译
- 主释义保持简洁，其他释义和 macOS 系统词典内容可分别折叠展开
- 显示 Oxford 3000、IELTS、TOEFL、GRE 等词汇标签（来自 ECDICT 元数据）
- 英文短语、句子及中译英使用 Apple Translation 本地语言包
- 辅助功能文本优先，ScreenCaptureKit + Vision OCR 回退
- 日间/夜间主题、窗口固定、多显示器与全屏 Space 支持
- 菜单栏常驻，不占用 Dock，不保存查询历史

## 本地构建

当前项目使用 SwiftPM，完整 Xcode 不是必需项；macOS Command Line Tools 即可构建。

```bash
swift test
./script/build_and_run.sh
./script/build_and_run.sh --verify
```

生成通用 DMG：

```bash
./script/package_release.sh
```

输出位于 `dist/Moyu Translate.app`、`dist/Moyu Translate.dmg` 和对应 SHA-256 文件。

重新生成完整精简 ECDICT（首次需要下载固定提交的源 CSV）：

```bash
./script/build_dictionary.py
```

仓库提交的 v0.1.1 数据库由固定提交的完整 ECDICT CSV 筛选生成，并用项目维护的常用词条校正高频释义。原始 63MB CSV 不提交，来源提交、SHA-256 和唯一词条数记录在 `Sources/MoyuTranslate/Resources/ECDICT_SOURCE.txt`。运行时未命中的词条仍由 Apple 本地语言包翻译。

重新生成本地图标资产：

```bash
swift script/generate_icons.swift
./script/build_icns.sh
```

image-2 的最终替换提示词保存在 `Assets/IMAGEGEN_PROMPT.md`。当前环境未配置 `OPENAI_API_KEY`，所以仓库内图标由本地 Core Graphics 绘制脚本生成，可重复构建。

## 权限与隐私

Moyu Translate 需要辅助功能权限来监听全局 Option 并读取可访问文本，需要屏幕录制权限来识别图片、视频和游戏画面。应用还可读取“词典”App 中已启用的 macOS 本地词典；不会复制或上传词典内容。所有识别、查词与翻译均在本机执行；应用不包含分析、账号、云端 API、历史或收藏功能。

Oxford、Cambridge 等商业词典正文不随应用分发。macOS 系统词典可能包含 Oxford，实际来源取决于用户系统版本与“词典”App 设置；应用统一如实标记为“macOS 系统词典”。IELTS、TOEFL 等显示为考试词汇标签，不标记为独立词典。

完整安装与操作说明见 [中文用户指南](docs/USER_GUIDE.zh-CN.md)。

## 许可

项目源码使用 [MIT License](LICENSE)。ECDICT 许可与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
