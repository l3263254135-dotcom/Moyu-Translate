# Moyu Translate v0.2 Architecture

## Repository shape

- `apps/desktop`: Tauri 2 desktop client and React floating panel.
- `apps/website`: Astro bilingual website deployed to GitHub Pages.
- `packages/contracts`: platform-neutral request, result, model and release contracts.
- `packages/ui`: shared brand tokens and React primitives.
- `tools/dictionary`: reproducible Dictionary v2 build pipeline.
- `Sources/MoyuTranslate`: preserved native macOS v0.1 stable implementation.

## Runtime boundaries

The React surface owns layout and transient interaction state. Rust owns SQLite and platform adapters. A dedicated Web Worker owns pinned model download, resumable partial data, SHA-256 verification, Cache API storage and ONNX inference. Platform-specific modules are compiled behind `cfg(target_os)` and expose the same Tauri commands.

`TranslationRequest` first enters the Rust command layer. A normalized single English word queries Dictionary v2. Other text requires a verified local language pack. Translation results always use the shared `TranslationResult` contract, so both platforms render identical sections.

User data is separate from the bundled dictionary. `moyu-user.sqlite` stores preferences, vocabulary entries and review progress. `vocabulary_entries` uses a normalized English term key, fixed review stages and UTC due timestamps. A one-time transaction migrates beta.1 favorites while retaining the old table for rollback. History writes occur only when `historyEnabled` is true and are capped at 500 records.

The shared React layer uses the bundled Compromise parser to reject contextual subject-predicate sentences before requesting a `VocabularyCandidate` from Rust. The Rust classifier then uses the offline dictionary's primary and alternate parts of speech as a second validation layer, including during beta.1 favorite migration. This keeps ambiguous noun phrases such as `customer needs analysis` and `operations research method` reviewable while rejecting contextual verbs such as `went`, `flew` and `book`. Review grading is serialized through the user-store mutex: `known` advances through 1/3/7/14/30/60-day intervals, while `again` resets the stage and schedules the entry ten minutes later.

## Dictionary build

Dictionary v2 selects 250,000 ECDICT records with deterministic quality scoring, then applies project corrections. WordNet supplies open synonyms, antonyms and English examples. CMUdict supplies US pronunciations converted from ARPABET to IPA. Source archives remain build inputs; only the derived SQLite database ships with the app.

The schema keeps entries, pronunciations, senses, forms, tags, examples and relations in separate tables. FTS5 supports prefix search without loading the database into memory.

## Release flow

GitHub Actions builds macOS and Windows artifacts from the same commit. A release job publishes DMG, EXE, MSI and checksum files. The Pages job then regenerates `release-manifest.json`, so website download buttons cannot drift from GitHub Releases.
