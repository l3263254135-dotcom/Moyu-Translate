export type TranslationOrigin = "manual" | "accessibility" | "ocr";
export type SupportedLanguage = "en" | "zh-Hans";
export type ThemeMode = "light" | "dark" | "system";

export interface CursorAnchor {
  x: number;
  y: number;
  displayId?: string;
}

export interface DictionaryOptions {
  useOfflineDictionary: boolean;
  usePlatformDictionary: boolean;
  showVocabularyTags: boolean;
  includeExamples: boolean;
  includeRelations: boolean;
}

export interface TranslationRequest {
  text: string;
  origin: TranslationOrigin;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  anchor?: CursorAnchor;
  dictionaryOptions: DictionaryOptions;
}

export interface Pronunciation {
  locale: "general" | "en-GB" | "en-US";
  ipa: string;
  source: string;
}

export interface DictionarySense {
  id: string;
  partOfSpeech: string;
  meanings: string[];
  frequencyRank?: number;
  domain?: string;
  register?: string;
  source: string;
}

export interface WordForm {
  label: string;
  value: string;
}

export interface DictionaryExample {
  id: string;
  english: string;
  chinese?: string;
  chineseProvider?: "dictionary" | "local-model";
  source: string;
}

export interface WordRelation {
  type: "synonym" | "antonym";
  words: string[];
  source: string;
}

export interface DictionarySourceInfo {
  id: string;
  title: string;
  detail?: string;
  platformOnly?: boolean;
}

export interface TranslationResult {
  sourceText: string;
  primaryText: string;
  headword?: string;
  pronunciations: Pronunciation[];
  senses: DictionarySense[];
  forms: WordForm[];
  examples: DictionaryExample[];
  relations: WordRelation[];
  vocabularyTags: string[];
  sources: DictionarySourceInfo[];
  provider: string;
  latencyMilliseconds: number;
}

export type SavedTranslationKind = "favorite" | "history";

export interface SavedTranslation {
  id: string;
  kind: SavedTranslationKind;
  storedAt: string;
  result: TranslationResult;
}

export type ReviewRating = "again" | "known";
export type VocabularyFilter = "all" | "due" | "mastered";

export interface VocabularyCandidate {
  term: string;
  definition: string;
  originalSourceText: string;
  result: TranslationResult;
}

export interface VocabularyEntry {
  id: string;
  term: string;
  definition: string;
  addedAt: string;
  reviewStage: number;
  reviewCount: number;
  lapseCount: number;
  lastReviewedAt?: string | null;
  nextReviewAt: string;
  reviewEligible: boolean;
  result: TranslationResult;
}

export interface VocabularyStats {
  total: number;
  dueToday: number;
  mastered: number;
  legacy: number;
}

export type PermissionState = "granted" | "denied" | "not-determined" | "unavailable";

export interface PlatformCapabilities {
  platform: "macos" | "windows" | "web";
  triggerKeyLabel: "Option" | "Alt";
  accessibility: PermissionState;
  screenCapture: PermissionState;
  textToSpeech: boolean;
  platformDictionary: boolean;
  launchAtLogin: boolean;
}

export interface ModelPackFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ModelPackManifest {
  id: string;
  version: string;
  sourceRevision: string;
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
  downloadUrl: string;
  archiveSha256: string;
  archiveBytes: number;
  files: ModelPackFile[];
}

export type ModelPackState = "missing" | "downloading" | "ready" | "invalid" | "error";

export interface ModelPackStatus {
  id: string;
  state: ModelPackState;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

export interface ReleaseDownload {
  url: string;
  sha256Url: string;
  label: string;
  architecture: string;
}

export interface ReleaseManifest {
  version: string;
  channel: "stable" | "beta";
  publishedAt: string;
  releaseUrl: string;
  requirements: {
    macos: string;
    windows: string;
  };
  downloads: {
    macos?: ReleaseDownload;
    windowsExe?: ReleaseDownload;
    windowsMsi?: ReleaseDownload;
  };
}

export interface AppPreferences {
  enabled: boolean;
  autoPronounce: boolean;
  theme: ThemeMode;
  pinned: boolean;
  launchAtLogin: boolean;
  holdDurationMilliseconds: number;
  historyEnabled: boolean;
  dictionaryOptions: DictionaryOptions;
}
