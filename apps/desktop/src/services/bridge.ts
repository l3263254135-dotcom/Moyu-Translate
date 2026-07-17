import type {
  AppPreferences,
  ModelPackStatus,
  PlatformCapabilities,
  ReviewRating,
  SavedTranslation,
  SavedTranslationKind,
  TranslationRequest,
  TranslationResult,
  VocabularyCandidate,
  VocabularyEntry,
  VocabularyFilter,
  VocabularyStats,
} from "@moyu/contracts";
import {
  localModelStatuses,
  prepareLocalModel,
  removeLocalModel,
  translateWithLocalModel,
  type ModelDirection,
} from "./localTranslation";
import {
  MASTERED_REVIEW_STAGE,
  nextReviewSchedule,
  normalizeVocabularyTerm,
  takeReviewBatch,
  vocabularyCandidateFromResult,
} from "./vocabulary";

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

const previewResult: TranslationResult = {
  sourceText: "ability",
  headword: "ability",
  primaryText: "能力；才能",
  pronunciations: [
    { locale: "general", ipa: "əˈbɪləti", source: "ECDICT" },
    { locale: "en-US", ipa: "əˈbɪləti", source: "CMUdict" },
  ],
  senses: [
    {
      id: "ability-n-1",
      partOfSpeech: "n.",
      meanings: ["能力；才能", "做成某事所需要的本领或素质"],
      frequencyRank: 783,
      source: "ECDICT",
    },
    {
      id: "ability-n-2",
      partOfSpeech: "n.",
      meanings: ["技能；才智"],
      source: "WordNet",
    },
  ],
  forms: [{ label: "复数", value: "abilities" }],
  examples: [
    {
      id: "ability-example-1",
      english: "She has the ability to explain difficult ideas clearly.",
      chinese: "她有能力把复杂的想法解释清楚。",
      chineseProvider: "local-model",
      source: "WordNet · 本地翻译",
    },
  ],
  relations: [
    { type: "synonym", words: ["capability", "capacity", "talent"], source: "WordNet" },
    { type: "antonym", words: ["inability"], source: "WordNet" },
  ],
  vocabularyTags: ["Oxford 3000", "IELTS", "TOEFL", "CET-4", "考研"],
  sources: [
    { id: "ecdict", title: "ECDICT", detail: "开放英汉词典" },
    { id: "wordnet", title: "WordNet", detail: "词义关系与例句" },
  ],
  provider: "Moyu 离线词典",
  latencyMilliseconds: 38,
};

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function platformCapabilities(): Promise<PlatformCapabilities> {
  if (isTauriRuntime()) return invokeCommand("platform_capabilities");
  const windows = navigator.userAgent.includes("Windows");
  return {
    platform: windows ? "windows" : "web",
    triggerKeyLabel: windows ? "Alt" : "Option",
    accessibility: "not-determined",
    screenCapture: "not-determined",
    textToSpeech: true,
    platformDictionary: !windows,
    launchAtLogin: true,
  };
}

export async function translate(
  request: TranslationRequest,
  onModelProgress?: (status: ModelPackStatus) => void,
): Promise<TranslationResult> {
  if (isTauriRuntime()) {
    try {
      return await invokeCommand("translate", { request });
    } catch (error) {
      if (!String(error).includes("MODEL_REQUIRED")) throw error;
      const result = await translateWithLocalModel(request, onModelProgress);
      await invokeCommand("record_translation_result", { result });
      return result;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 90));
  const result = request.text.trim().toLowerCase() === "ability"
    ? previewResult
    : {
        ...previewResult,
        sourceText: request.text,
        headword: request.text,
        primaryText: `“${request.text}”的本地翻译预览`,
        pronunciations: [],
        senses: [],
        forms: [],
        examples: [],
        relations: [],
        vocabularyTags: [],
        sources: [],
        provider: "Moyu 本地模型预览",
      };
  recordPreviewHistory(result);
  return result;
}

export async function captureAtCursor(): Promise<string> {
  if (isTauriRuntime()) return invokeCommand("capture_text_at_cursor");
  return "ability";
}

export async function speak(text: string, locale = "en-US"): Promise<void> {
  if (isTauriRuntime()) return invokeCommand("speak", { text, locale });
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  speechSynthesis.speak(utterance);
}

export async function setPinned(pinned: boolean): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("set_panel_pinned", { pinned });
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("save_preferences", { preferences });
  else localStorage.setItem("moyu-preferences", JSON.stringify(preferences));
}

export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const autostart = await import("@tauri-apps/plugin-autostart");
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

export async function launchAtLoginEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function loadPreferences(): Promise<AppPreferences | null> {
  if (isTauriRuntime()) return invokeCommand("load_preferences");
  const stored = localStorage.getItem("moyu-preferences");
  return stored ? (JSON.parse(stored) as AppPreferences) : null;
}

export async function toggleFavorite(result: TranslationResult, favorite: boolean): Promise<void> {
  const candidate = await resolveVocabularyCandidate(result);
  if (!candidate) throw new Error("生词本仅支持英文单词或短语");
  if (favorite) await saveVocabulary(candidate);
  else await removeVocabulary(candidate.term);
}

export async function favoriteState(sourceText: string): Promise<boolean> {
  return isInVocabulary(sourceText);
}

export async function resolveVocabularyCandidate(result: TranslationResult): Promise<VocabularyCandidate | null> {
  const candidate = vocabularyCandidateFromResult(result);
  if (!candidate) return null;
  if (isTauriRuntime()) return invokeCommand("vocabulary_candidate", { result });
  return candidate;
}

export async function saveVocabulary(candidate: VocabularyCandidate): Promise<VocabularyEntry> {
  if (isTauriRuntime()) return invokeCommand("save_vocabulary", { candidate });
  ensurePreviewVocabularyMigrated();
  const key = vocabularyKey(candidate.term);
  const entries = previewVocabulary();
  const existing = entries.find((entry) => entry.reviewEligible && vocabularyKey(entry.term) === key);
  const entry: VocabularyEntry = existing
    ? {
        ...existing,
        term: normalizeVocabularyTerm(candidate.term),
        definition: candidate.definition.trim(),
        reviewEligible: true,
        result: candidate.result,
      }
    : vocabularyPreview(candidate, true);
  writePreviewVocabulary([entry, ...entries.filter((item) => item.id !== entry.id)]);
  return entry;
}

export async function removeVocabulary(term: string, entryId?: string): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("remove_vocabulary", { term, entryId: entryId ?? null });
  else {
    ensurePreviewVocabularyMigrated();
    const key = vocabularyKey(term);
    writePreviewVocabulary(previewVocabulary().filter((entry) => entryId
      ? entry.id !== entryId
      : !(entry.reviewEligible && vocabularyKey(entry.term) === key)));
  }
}

export async function isInVocabulary(term: string): Promise<boolean> {
  if (isTauriRuntime()) return invokeCommand("is_in_vocabulary", { term });
  ensurePreviewVocabularyMigrated();
  const key = vocabularyKey(term);
  return previewVocabulary().some((entry) => entry.reviewEligible && vocabularyKey(entry.term) === key);
}

export async function listVocabulary(
  query = "",
  filter: VocabularyFilter = "all",
  limit = 100,
): Promise<VocabularyEntry[]> {
  if (isTauriRuntime()) return invokeCommand("list_vocabulary", { query, filter, limit });
  ensurePreviewVocabularyMigrated();
  const normalized = query.trim().toLocaleLowerCase();
  const now = Date.now();
  return previewVocabulary()
    .filter((entry) => !normalized || entry.term.toLocaleLowerCase().includes(normalized) || entry.definition.toLocaleLowerCase().includes(normalized))
    .filter((entry) => filter === "all"
      || (filter === "due" && entry.reviewEligible && new Date(entry.nextReviewAt).getTime() <= now)
      || (filter === "mastered" && entry.reviewEligible && entry.reviewStage >= MASTERED_REVIEW_STAGE))
    .sort((left, right) => filter === "due"
      ? new Date(left.nextReviewAt).getTime() - new Date(right.nextReviewAt).getTime()
      : new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime())
    .slice(0, limit);
}

export async function dueVocabulary(limit = 20): Promise<VocabularyEntry[]> {
  if (isTauriRuntime()) return invokeCommand("due_vocabulary", { limit });
  ensurePreviewVocabularyMigrated();
  return takeReviewBatch(previewVocabulary(), new Date(), limit);
}

export async function vocabularyStats(): Promise<VocabularyStats> {
  if (isTauriRuntime()) return invokeCommand("vocabulary_stats");
  ensurePreviewVocabularyMigrated();
  const entries = previewVocabulary();
  const now = Date.now();
  return {
    total: entries.length,
    dueToday: entries.filter((entry) => entry.reviewEligible && new Date(entry.nextReviewAt).getTime() <= now).length,
    mastered: entries.filter((entry) => entry.reviewEligible && entry.reviewStage >= MASTERED_REVIEW_STAGE).length,
    legacy: entries.filter((entry) => !entry.reviewEligible).length,
  };
}

export async function reviewVocabulary(
  term: string,
  rating: ReviewRating,
  reviewedAt = new Date(),
): Promise<VocabularyEntry> {
  if (isTauriRuntime()) {
    return invokeCommand("review_vocabulary", { term, rating, reviewedAt: reviewedAt.toISOString() });
  }
  ensurePreviewVocabularyMigrated();
  const key = vocabularyKey(term);
  const entries = previewVocabulary();
  const current = entries.find((entry) => vocabularyKey(entry.term) === key && entry.reviewEligible);
  if (!current) throw new Error("找不到可复习的生词");
  const schedule = nextReviewSchedule(current.reviewStage, rating, reviewedAt);
  const updated: VocabularyEntry = {
    ...current,
    reviewStage: schedule.reviewStage,
    reviewCount: current.reviewCount + 1,
    lapseCount: current.lapseCount + schedule.lapseIncrement,
    lastReviewedAt: reviewedAt.toISOString(),
    nextReviewAt: schedule.nextReviewAt,
  };
  writePreviewVocabulary(entries.map((entry) => vocabularyKey(entry.term) === key ? updated : entry));
  return updated;
}

export async function listSavedTranslations(
  kind: SavedTranslationKind,
  query = "",
  limit = 100,
): Promise<SavedTranslation[]> {
  if (isTauriRuntime()) return invokeCommand("list_saved_translations", { kind, query, limit });
  if (kind === "favorite") {
    return (await listVocabulary(query, "all", limit)).map((entry) => ({
      id: entry.id,
      kind: "favorite",
      storedAt: entry.addedAt,
      result: entry.result,
    }));
  }
  const normalized = query.trim().toLocaleLowerCase();
  return previewSaved(kind)
    .filter((item) => !normalized || item.result.sourceText.toLocaleLowerCase().includes(normalized))
    .slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("clear_history");
  else localStorage.removeItem("moyu-preview-history");
}

export async function modelStatus(): Promise<ModelPackStatus[]> {
  return localModelStatuses();
}

export async function prepareModel(
  direction: ModelDirection,
  onProgress?: (status: ModelPackStatus) => void,
): Promise<ModelPackStatus> {
  return prepareLocalModel(direction, onProgress);
}

export async function removeModel(direction: ModelDirection): Promise<ModelPackStatus> {
  return removeLocalModel(direction);
}

export async function hidePanel(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

function savedPreview(kind: SavedTranslationKind, result: TranslationResult): SavedTranslation {
  return {
    id: kind === "favorite" ? result.sourceText : `${Date.now()}`,
    kind,
    storedAt: new Date().toISOString(),
    result,
  };
}

function previewSaved(kind: SavedTranslationKind): SavedTranslation[] {
  const key = kind === "favorite" ? "moyu-preview-favorites" : "moyu-preview-history";
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as SavedTranslation[];
  } catch {
    return [];
  }
}

const previewVocabularyKey = "moyu-preview-vocabulary-v2";
const previewVocabularyMigrationKey = "moyu-preview-vocabulary-migrated-v1";

function vocabularyKey(term: string) {
  return normalizeVocabularyTerm(term).toLocaleLowerCase();
}

function vocabularyPreview(
  candidate: VocabularyCandidate,
  reviewEligible: boolean,
  addedAt = new Date().toISOString(),
  id?: string,
): VocabularyEntry {
  const term = normalizeVocabularyTerm(candidate.term) || normalizeVocabularyTerm(candidate.originalSourceText) || "未命名收藏";
  return {
    id: id ?? vocabularyKey(term),
    term,
    definition: candidate.definition.trim(),
    addedAt,
    reviewStage: 0,
    reviewCount: 0,
    lapseCount: 0,
    nextReviewAt: addedAt,
    reviewEligible,
    result: candidate.result,
  };
}

function previewVocabulary(): VocabularyEntry[] {
  try {
    return JSON.parse(localStorage.getItem(previewVocabularyKey) ?? "[]") as VocabularyEntry[];
  } catch {
    return [];
  }
}

function writePreviewVocabulary(entries: VocabularyEntry[]) {
  localStorage.setItem(previewVocabularyKey, JSON.stringify(entries));
}

function ensurePreviewVocabularyMigrated() {
  if (localStorage.getItem(previewVocabularyMigrationKey) === "true") return;
  const existing = previewVocabulary();
  const eligibleKeys = new Set(existing.filter((entry) => entry.reviewEligible).map((entry) => vocabularyKey(entry.term)));
  const migrated: VocabularyEntry[] = [];
  for (const [index, saved] of previewSaved("favorite").entries()) {
    const candidate = vocabularyCandidateFromResult(saved.result);
    const fallback: VocabularyCandidate = candidate ?? {
      term: saved.result.sourceText,
      definition: saved.result.primaryText,
      originalSourceText: saved.result.sourceText,
      result: saved.result,
    };
    const key = vocabularyKey(fallback.term);
    const reviewEligible = Boolean(candidate) && !eligibleKeys.has(key);
    const id = reviewEligible ? key : `legacy:${index}:${key}`;
    migrated.push(vocabularyPreview(fallback, reviewEligible, normalizeStoredAt(saved.storedAt), id));
    if (reviewEligible) eligibleKeys.add(key);
  }
  writePreviewVocabulary([...migrated, ...existing]);
  localStorage.setItem(previewVocabularyMigrationKey, "true");
}

function normalizeStoredAt(value: string) {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/u.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function recordPreviewHistory(result: TranslationResult) {
  const preferences = localStorage.getItem("moyu-preferences");
  if (!preferences || !(JSON.parse(preferences) as AppPreferences).historyEnabled) return;
  const history = [savedPreview("history", result), ...previewSaved("history")].slice(0, 500);
  localStorage.setItem("moyu-preview-history", JSON.stringify(history));
}

export { isTauriRuntime };
