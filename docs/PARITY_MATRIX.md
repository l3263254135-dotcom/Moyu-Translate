# Moyu Translate 双平台功能一致性矩阵

本矩阵是 `v0.2.0-beta` 的发布门禁。核心项只有在 macOS 和 Windows 均完成真实设备验证后才能标记为通过。

| 功能 | macOS 15+ | Windows 10/11 x64 | Beta 验收标准 |
| --- | --- | --- | --- |
| 长按触发 | Option 350ms | Alt 350ms | 阈值后 150ms 内显示；AltGr/Ctrl+Alt 不误触 |
| 光标锚点 | Quartz 坐标 | Win32 物理坐标 | 多屏和高 DPI 下停靠在原光标附近 |
| 可访问文本 | AXUIElement | UI Automation | 网页、PDF、原生文本控件可读取 |
| OCR 回退 | ScreenCaptureKit + Vision | DXGI + Windows OCR | 面板先隐藏；1.5 秒内返回或明确报错 |
| 英文单词 | Dictionary v2 SQLite | 同一 SQLite | 词条、义项顺序、标签和折叠内容一致 |
| 英中句子 | 固定提交 Moyu q8 语言包 | 同一语言包 | 断点续传与 SHA-256 通过；预热后短句 3 秒内完成 |
| 中英句子 | 固定提交 Moyu q8 语言包 | 同一语言包 | 断点续传与 SHA-256 通过；预热后短句 3 秒内完成 |
| 系统朗读 | macOS `say`/系统声音 | Windows Speech | 单词可朗读；停止和重复播放正常 |
| 主释义排版 | React 共享组件 | React 共享组件 | 相同宽度下视觉快照一致 |
| 学习内容 | 音标、词形、例句、关系 | 相同 | 默认紧凑，展开后不溢出 480 点面板 |
| 收藏 | 本地 SQLite | 本地 SQLite | 重启后保留，不联网 |
| 历史 | 默认关闭 | 默认关闭 | 关闭时零写入；开启后最多保留 500 条 |
| 主题 | 日间/夜间/系统 | 相同 | 重启持久化；对比度满足 WCAG AA |
| 固定窗口 | 全 Space 浮层 | 置顶工具窗 | 固定后失焦不收起，取消后恢复智能收起 |
| 登录启动 | LaunchAgent | Startup Task | 开关状态与系统实际状态一致 |
| 安装包 | Universal DMG | NSIS EXE + MSI | 安装、启动、卸载和 SHA-256 校验通过 |

## 允许的平台差异

- 按键名称分别显示 `Option` 和 `Alt`。
- 权限入口和首次打开说明使用系统原生术语。
- macOS 可在“更多来源”中显示用户启用的系统词典；这不是核心释义来源。
- Windows 独占全屏游戏、DRM 视频和系统保护窗口不承诺 OCR 可用，必须显示明确提示。

## 当前实现状态

- `v0.1.1` 原生 macOS 稳定版：已发布。
- `v0.2.0-beta.1` Tauri 共享 UI、Dictionary v2、收藏/历史管理和已校验模型缓存：已建立。
- 原生 OCR、Windows 低级键盘钩子和 Windows 安装包：必须在 Beta 发布前完成真实设备或 GitHub Windows runner 验证。
