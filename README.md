# Moyu Translate

Moyu Translate 是一款本地优先的 macOS 与 Windows 悬浮翻译工具。把光标停在文字上，长按 `Option` 或 `Alt` 约 350ms，即可在原位置附近查看精简释义；无需选中、复制或切换应用。

![Moyu Translate app icon](Assets/IconSource.png)

> `v0.2.0-beta.2` 正在以 Tauri 2 + React + TypeScript 重构双平台客户端。原生 SwiftUI `v0.1.1` 稳定版继续保留在 `Sources/MoyuTranslate`，不会被 Beta 架构覆盖。

## v0.2 Beta 功能

- macOS 15+，Apple Silicon/Intel 通用构建；Windows 10 22H2、Windows 11 x64。
- macOS 长按 Option、Windows 长按 Alt 呼出；Windows 会排除 AltGr 与 Ctrl+Alt。
- 25 万条结构化离线英汉词条，包含分词性义项、词形、音标、例句、同反义词、词频和考试标签。
- 英文单词优先查询 SQLite FTS5；短语、句子和中译英使用独立 Web Worker 中的 q8 本地模型。
- 模型首次使用时按固定提交下载，支持断点续传并逐文件校验 SHA-256；校验后的缓存可断网翻译，查询文本不会发送到翻译 API。
- macOS 使用辅助功能文本、ScreenCaptureKit 与 Vision；Windows 使用 UI Automation 与 Windows OCR。
- 暖白/炭黑双主题、鱼干橙品牌色、窗口固定、系统朗读、本地生词本、卡片复习和默认关闭的本地历史。
- Astro 中英双语官网、GitHub Release 下载清单、SEO、宣传运营 Markdown 与中文 PDF 手册。

Oxford、Cambridge 等商业词典正文不会打包。`Oxford 3000`、`IELTS`、`TOEFL`、`GRE` 等仅作为学习/考试标签显示。

## 仓库结构

```text
apps/desktop          Tauri 2 + React 跨平台客户端
apps/website          Astro 中英双语官网
packages/contracts    共享请求、结果、模型与发布类型
packages/ui           共享品牌 token 与 React UI 组件
tools/dictionary      Dictionary v2 可复现构建工具
tools/docs            宣传 PDF 生成工具
Sources/MoyuTranslate 原生 macOS v0.1.1 稳定版
docs/marketing        零基础多渠道宣传手册
```

## 本地开发

环境：Node.js 22、pnpm 10、Rust stable；构建原生稳定版还需要 macOS 15 SDK/Swift 6。

```bash
pnpm install
pnpm check
pnpm dev
```

启动 Tauri 开发版：

```bash
pnpm tauri dev
```

构建 macOS 通用 DMG：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm --filter @moyu/desktop tauri build --target universal-apple-darwin --bundles dmg
```

Windows x64 安装包需在 Windows 上构建：

```powershell
pnpm --filter @moyu/desktop tauri build --bundles nsis,msi
```

GitHub Actions 会同时生成 Universal DMG、NSIS EXE、MSI 和 SHA-256；核心功能未通过双平台矩阵时不得将 Beta 提升为正式版。

## Dictionary v2

仓库提交的 `dictionary-v2.sqlite` 由固定版本 ECDICT、WordNet 3.1、CMU Pronouncing Dictionary 和项目人工校正层生成：

- 250,000 个结构化词条
- 126,052 条 CMUdict 发音
- 73,832 个 WordNet 匹配词条
- SHA-256：`70e7167d81b44d36be40ab0a8487b041bc47a12866553556bce77aad22ec3db3`

```bash
pnpm dictionary:test
pnpm dictionary:v2
```

完整来源、固定提交和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 离线模型

两个 q8 语言方向都固定到不可变的 Transformers.js 模型提交：

- 英文 → 中文：`Xenova/opus-mt-en-zh@046f55aec303cdee3e0318604406d4df20f1e8ea`
- 中文 → 英文：`Xenova/opus-mt-zh-en@39d480d52a9ea3065a1f117adfe4dbc55de10e6f`

运行时只把 `config`、tokenizer、q8 encoder 和 merged decoder 六个必需文件写入专用缓存。清单固定每个文件的字节数与 SHA-256；中断数据保存在 IndexedDB，重新下载时使用 HTTP Range 续传。设置页可单独删除任一方向的语言包。

## 隐私与限制

- 单词数据库、OCR、生词本、复习进度和可选历史均在当前设备处理。
- 历史默认关闭，开启后最多保留 500 条，可随用户数据库删除。
- q8 模型首次下载需要网络；文件校验通过后不依赖云端翻译服务。
- DRM/系统保护内容无法截图时会明确报错。
- Windows 独占全屏游戏不保证 OCR；优先使用无边框窗口模式。
- Beta 为 macOS ad-hoc 签名和未正式签名的 Windows 安装器，首次打开请参考用户指南处理 Gatekeeper/SmartScreen。

操作与权限说明见 [v0.2 中文用户指南](docs/USER_GUIDE_V2.zh-CN.md)，双平台发布门禁见 [功能一致性矩阵](docs/PARITY_MATRIX.md)。

## 宣传资料

- Markdown 总入口：[docs/marketing/README.md](docs/marketing/README.md)
- 中文 PDF：[docs/Moyu-Translate-Marketing-Guide-zh-CN.pdf](docs/Moyu-Translate-Marketing-Guide-zh-CN.pdf)
- 官网源码：`apps/website`

## License

项目源码使用 [MIT License](LICENSE)。第三方数据、模型和依赖按各自许可证使用。
