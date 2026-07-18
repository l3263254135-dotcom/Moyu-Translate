# Changelog

## 0.2.0-beta.3 - 2026-07-18

- 修复 macOS 辅助应用模式下菜单栏图标不可见的问题。
- 新增专用的“猫脸 + 小鱼”单色模板图标，可自动适配浅色与深色菜单栏。
- Windows 托盘继续使用彩色应用图标，保持双平台原生显示习惯。

## 0.2.0-beta.2 - 2026-07-17

- Upgraded local favorites into a searchable vocabulary notebook with due and mastered filters.
- Added offline flashcard review with pronunciation, answer reveal, examples and fixed 1/3/7/14/30/60-day intervals.
- Added binary known/again grading, ten-minute rescheduling with at most one same-round requeue, and a 20-card review batch.
- Added transactional migration from beta.1 favorites without deleting the rollback source table.
- Added local vocabulary statistics and a due-count badge shared by macOS and Windows.

## 0.2.0-beta.1 - 2026-07-15

- Added the Tauri 2 + React + TypeScript macOS/Windows client while preserving native macOS v0.1.1.
- Added a 250,000-entry Dictionary v2 generated from pinned ECDICT, WordNet and CMUdict sources.
- Added structured pronunciation, part-of-speech senses, forms, examples, relations and vocabulary tags.
- Added pinned q8 Transformers.js language-model workers with resumable downloads, per-file SHA-256 verification, progress, deletion and local WebView caching.
- Added macOS Accessibility/ScreenCaptureKit/Vision capture sidecar and Windows Alt/UI Automation/OCR adapters.
- Added searchable local favorites, opt-in searchable/clearable history, themes, pinning, launch-at-login and system speech.
- Added the bilingual Astro website, release manifest synchronization, SEO and GitHub Pages workflows.
- Added beginner marketing guides, templates, a 30-day launch plan and a generated Chinese PDF handbook.
- Added macOS/Windows CI and prerelease workflows for DMG, NSIS EXE, MSI and checksums.

## 0.1.1 - 2026-07-12

- Expanded the bundled ECDICT database to more than 58,000 common entries.
- Added separately collapsible alternative meanings and macOS system dictionary definitions.
- Added Oxford 3000, IELTS, TOEFL, GRE, and other vocabulary-list tags from ECDICT metadata.
- Added settings for ECDICT, macOS system dictionary, and exam-tag sources.
- Documented commercial dictionary licensing boundaries and local source behavior.

## 0.1.0 - 2026-07-12

- Added the native macOS menu bar application and floating translation panel.
- Added Option hold activation, pinning, light/dark themes, and settings.
- Added local ECDICT lookup, Apple Translation, Accessibility capture, and Vision OCR fallback.
- Added universal app packaging, ad-hoc signing, DMG generation, tests, and Chinese documentation.
