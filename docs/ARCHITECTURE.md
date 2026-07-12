# Architecture

Moyu Translate keeps platform-dependent work behind narrow services while SwiftUI owns rendering and observable state.

## Runtime flow

1. `OptionHoldMonitor` observes a 350ms Option-only hold and records the Quartz cursor point.
2. `PanelCoordinator` positions a nonactivating `NSPanel` near that point and focuses the SwiftUI input.
3. Manual input produces a `TranslationRequest` through `AppModel`.
4. English single words query the compact ECDICT SQLite database for primary meanings and vocabulary tags. `MacSystemDictionaryService` uses the public DictionaryServices API to read the user's active local dictionaries as a supplemental section.
5. Other input uses `AppleTranslationService` through SwiftUI's `translationTask` session.
6. The scope button calls `TextCaptureService`, which tries Accessibility text first and then ScreenCaptureKit plus Vision OCR.

## State and privacy

`PreferencesStore` persists only enabled state, theme, direction, pinned state, panel frame, launch-at-login preference, and dictionary-source toggles. Raw source text, system dictionary definitions, and translations are not persisted or logged.

## Distribution

The project builds a SwiftPM executable, stages it into a standard `.app` bundle, copies resources to `Contents/Resources`, applies ad-hoc signing, merges arm64 and x86_64 with `lipo`, and creates a compressed DMG with `hdiutil`.
