import type {
  AppPreferences,
  ModelPackStatus,
  PlatformCapabilities,
  ReviewRating,
  SavedTranslation,
  SavedTranslationKind,
  TranslationResult,
  VocabularyCandidate,
  VocabularyEntry,
  VocabularyFilter,
  VocabularyStats,
} from "@moyu/contracts";
import { create } from "zustand";
import {
  captureAtCursor,
  clearHistory,
  dueVocabulary,
  isInVocabulary,
  launchAtLoginEnabled,
  listSavedTranslations,
  listVocabulary,
  loadPreferences,
  modelStatus,
  platformCapabilities,
  prepareModel,
  removeModel,
  removeVocabulary,
  resolveVocabularyCandidate,
  reviewVocabulary,
  savePreferences,
  saveVocabulary,
  setLaunchAtLogin,
  setPinned,
  speak,
  translate,
  vocabularyStats,
} from "../services/bridge";
import { automaticPronunciationText } from "../services/autoPronunciation";
import {
  normalizeVocabularyTerm,
  REVIEW_BATCH_SIZE,
  shouldRequeueReview,
} from "../services/vocabulary";

const defaultPreferences: AppPreferences = {
  enabled: true,
  autoPronounce: true,
  theme: "system",
  pinned: false,
  launchAtLogin: false,
  holdDurationMilliseconds: 350,
  historyEnabled: false,
  dictionaryOptions: {
    useOfflineDictionary: true,
    usePlatformDictionary: true,
    showVocabularyTags: true,
    includeExamples: true,
    includeRelations: true,
  },
};

const emptyVocabularyStats: VocabularyStats = {
  total: 0,
  dueToday: 0,
  mastered: 0,
  legacy: 0,
};

let libraryRequestSequence = 0;
let translationRequestSequence = 0;

function invalidateLibraryRequests() {
  libraryRequestSequence += 1;
}

function invalidateTranslationRequests() {
  translationRequestSequence += 1;
}

interface AppState {
  query: string;
  result: TranslationResult | null;
  error: string | null;
  working: boolean;
  inVocabulary: boolean;
  vocabularyCandidate: VocabularyCandidate | null;
  vocabularyMessage: string | null;
  settingsOpen: boolean;
  libraryOpen: boolean;
  libraryKind: SavedTranslationKind;
  libraryQuery: string;
  vocabularyFilter: VocabularyFilter;
  vocabularyEntries: VocabularyEntry[];
  vocabularyStats: VocabularyStats;
  savedTranslations: SavedTranslation[];
  libraryWorking: boolean;
  reviewOpen: boolean;
  reviewQueue: VocabularyEntry[];
  reviewIndex: number;
  reviewInitialCount: number;
  reviewCompletedCount: number;
  reviewRevealed: boolean;
  reviewWorking: boolean;
  reviewRequeuedTerms: string[];
  preferences: AppPreferences;
  capabilities: PlatformCapabilities | null;
  modelStatuses: ModelPackStatus[];
  setQuery: (query: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => Promise<void>;
  setLibraryKind: (kind: SavedTranslationKind) => Promise<void>;
  setLibraryQuery: (query: string) => void;
  setVocabularyFilter: (filter: VocabularyFilter) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  refreshVocabularyStats: () => Promise<void>;
  clearHistory: () => Promise<void>;
  removeVocabularyEntry: (entry: VocabularyEntry) => Promise<void>;
  openVocabularyEntry: (entry: VocabularyEntry) => Promise<void>;
  openSavedTranslation: (saved: SavedTranslation) => Promise<void>;
  startReview: () => Promise<void>;
  stopReview: () => Promise<void>;
  setReviewRevealed: (revealed: boolean) => void;
  gradeReview: (rating: ReviewRating) => Promise<void>;
  initialize: () => Promise<void>;
  submit: () => Promise<void>;
  capture: () => Promise<void>;
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  toggleTheme: () => Promise<void>;
  togglePinned: () => Promise<void>;
  toggleVocabulary: () => Promise<void>;
  installLanguageModel: (direction: "en-zh" | "zh-en") => Promise<void>;
  removeLanguageModel: (direction: "en-zh" | "zh-en") => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  query: "",
  result: null,
  error: null,
  working: false,
  inVocabulary: false,
  vocabularyCandidate: null,
  vocabularyMessage: null,
  settingsOpen: false,
  libraryOpen: false,
  libraryKind: "favorite",
  libraryQuery: "",
  vocabularyFilter: "all",
  vocabularyEntries: [],
  vocabularyStats: emptyVocabularyStats,
  savedTranslations: [],
  libraryWorking: false,
  reviewOpen: false,
  reviewQueue: [],
  reviewIndex: 0,
  reviewInitialCount: 0,
  reviewCompletedCount: 0,
  reviewRevealed: false,
  reviewWorking: false,
  reviewRequeuedTerms: [],
  preferences: defaultPreferences,
  capabilities: null,
  modelStatuses: [],

  setQuery: (query) => {
    invalidateTranslationRequests();
    set({ query });
  },
  setSettingsOpen: (settingsOpen) => {
    invalidateLibraryRequests();
    set({ settingsOpen, libraryOpen: false, reviewOpen: false, libraryWorking: false });
  },
  setLibraryOpen: async (libraryOpen) => {
    if (!libraryOpen) {
      invalidateLibraryRequests();
      set({ libraryOpen: false, reviewOpen: false, libraryWorking: false });
      return;
    }
    set({ libraryOpen: true, settingsOpen: false, reviewOpen: false });
    await get().refreshLibrary();
  },
  setLibraryKind: async (libraryKind) => {
    set({ libraryKind, libraryQuery: "", reviewOpen: false });
    await get().refreshLibrary();
  },
  setLibraryQuery: (libraryQuery) => {
    invalidateLibraryRequests();
    set({ libraryQuery, libraryWorking: false });
  },
  setVocabularyFilter: async (vocabularyFilter) => {
    set({ vocabularyFilter });
    await get().refreshLibrary();
  },
  refreshLibrary: async () => {
    const requestId = ++libraryRequestSequence;
    const { libraryKind, libraryQuery, vocabularyFilter } = get();
    set({ libraryWorking: true });
    try {
      if (libraryKind === "favorite") {
        const [vocabularyEntries, stats] = await Promise.all([
          listVocabulary(libraryQuery, vocabularyFilter),
          vocabularyStats(),
        ]);
        if (requestId !== libraryRequestSequence) return;
        set({ vocabularyEntries, vocabularyStats: stats, savedTranslations: [] });
      } else {
        const savedTranslations = await listSavedTranslations("history", libraryQuery);
        if (requestId !== libraryRequestSequence) return;
        set({ savedTranslations, vocabularyEntries: [] });
      }
    } catch (error) {
      if (requestId !== libraryRequestSequence) return;
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (requestId === libraryRequestSequence) set({ libraryWorking: false });
    }
  },
  refreshVocabularyStats: async () => {
    try {
      set({ vocabularyStats: await vocabularyStats() });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  clearHistory: async () => {
    await clearHistory();
    await get().refreshLibrary();
  },
  removeVocabularyEntry: async (entry) => {
    await removeVocabulary(entry.term, entry.id);
    const candidate = get().vocabularyCandidate;
    if (candidate && vocabularyKey(candidate.term) === vocabularyKey(entry.term)) {
      set({ inVocabulary: false, vocabularyMessage: "已从生词本移除" });
    }
    await get().refreshLibrary();
  },
  openVocabularyEntry: async (entry) => {
    invalidateLibraryRequests();
    set({
      query: entry.term,
      libraryOpen: false,
      reviewOpen: false,
      settingsOpen: false,
      error: null,
    });
    await get().submit();
  },
  openSavedTranslation: async (saved) => {
    const requestId = ++translationRequestSequence;
    const candidate = await resolveVocabularyCandidate(saved.result);
    if (requestId !== translationRequestSequence) return;
    const inVocabulary = candidate ? await isInVocabulary(candidate.term) : false;
    if (requestId !== translationRequestSequence) return;
    invalidateLibraryRequests();
    set({
      query: saved.result.sourceText,
      result: saved.result,
      error: null,
      inVocabulary,
      vocabularyCandidate: candidate,
      vocabularyMessage: null,
      libraryOpen: false,
      reviewOpen: false,
      settingsOpen: false,
      working: false,
    });
  },
  startReview: async () => {
    if (get().reviewWorking) return;
    invalidateLibraryRequests();
    set({ reviewWorking: true, error: null });
    try {
      const reviewQueue = await dueVocabulary(REVIEW_BATCH_SIZE);
      set({
        reviewOpen: true,
        reviewQueue,
        reviewIndex: 0,
        reviewInitialCount: reviewQueue.length,
        reviewCompletedCount: 0,
        reviewRevealed: false,
        reviewRequeuedTerms: [],
        libraryWorking: false,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ reviewWorking: false });
    }
  },
  stopReview: async () => {
    set({
      reviewOpen: false,
      reviewQueue: [],
      reviewIndex: 0,
      reviewInitialCount: 0,
      reviewCompletedCount: 0,
      reviewRevealed: false,
      reviewRequeuedTerms: [],
    });
    await get().refreshLibrary();
  },
  setReviewRevealed: (reviewRevealed) => set({ reviewRevealed }),
  gradeReview: async (rating) => {
    const { reviewQueue, reviewIndex, reviewRequeuedTerms } = get();
    const current = reviewQueue[reviewIndex];
    if (!current || get().reviewWorking) return;
    set({ reviewWorking: true, error: null });
    try {
      const updated = await reviewVocabulary(current.term, rating);
      const key = vocabularyKey(current.term);
      const shouldRequeue = shouldRequeueReview(current.term, rating, reviewRequeuedTerms);
      set({
        reviewQueue: shouldRequeue ? [...reviewQueue, updated] : reviewQueue,
        reviewIndex: reviewIndex + 1,
        reviewCompletedCount: get().reviewCompletedCount + 1,
        reviewRevealed: false,
        reviewRequeuedTerms: shouldRequeue ? [...reviewRequeuedTerms, key] : reviewRequeuedTerms,
      });
      await get().refreshVocabularyStats();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ reviewWorking: false });
    }
  },

  initialize: async () => {
    const [stored, capabilities, statuses, launchAtLogin, stats] = await Promise.all([
      loadPreferences(),
      platformCapabilities(),
      modelStatus(),
      launchAtLoginEnabled(),
      vocabularyStats(),
    ]);
    const preferences = {
      ...defaultPreferences,
      ...(stored ?? {}),
      launchAtLogin,
      dictionaryOptions: {
        ...defaultPreferences.dictionaryOptions,
        ...(stored?.dictionaryOptions ?? {}),
      },
    };
    set({ preferences, capabilities, modelStatuses: statuses, vocabularyStats: stats });
  },

  submit: async () => {
    const requestId = ++translationRequestSequence;
    const text = get().query.trim();
    if (!text) {
      set({ error: "请输入要查询的英文或中文", result: null, working: false, inVocabulary: false, vocabularyCandidate: null });
      return;
    }
    set({ working: true, error: null, inVocabulary: false, vocabularyCandidate: null, vocabularyMessage: null });
    try {
      const chinese = /[\u3400-\u9fff]/u.test(text);
      const result = await translate(
        {
          text,
          origin: "manual",
          sourceLanguage: chinese ? "zh-Hans" : "en",
          targetLanguage: chinese ? "en" : "zh-Hans",
          dictionaryOptions: get().preferences.dictionaryOptions,
        },
        (status) => {
          if (requestId === translationRequestSequence) {
            set((state) => ({ modelStatuses: mergeModelStatus(state.modelStatuses, status) }));
          }
        },
      );
      if (requestId !== translationRequestSequence) return;
      const candidate = await resolveVocabularyCandidate(result);
      if (requestId !== translationRequestSequence) return;
      const inVocabulary = candidate ? await isInVocabulary(candidate.term) : false;
      if (requestId !== translationRequestSequence) return;
      set({ result, inVocabulary, vocabularyCandidate: candidate });
      const pronunciationText = automaticPronunciationText(result);
      if (
        get().preferences.autoPronounce
        && get().capabilities?.textToSpeech !== false
        && pronunciationText
      ) {
        void speak(pronunciationText, "en-US").catch(() => undefined);
      }
    } catch (error) {
      if (requestId === translationRequestSequence) {
        set({ result: null, vocabularyCandidate: null, error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      if (requestId === translationRequestSequence) set({ working: false });
    }
  },

  capture: async () => {
    set({ working: true, error: null });
    try {
      const text = await captureAtCursor();
      set({ query: text });
      await get().submit();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ working: false });
    }
  },

  updatePreferences: async (patch) => {
    const preferences = { ...get().preferences, ...patch };
    set({ preferences });
    if (typeof patch.launchAtLogin === "boolean") await setLaunchAtLogin(patch.launchAtLogin);
    await savePreferences(preferences);
  },

  toggleTheme: async () => {
    const current = get().preferences.theme;
    const theme = current === "dark" ? "light" : "dark";
    await get().updatePreferences({ theme });
  },

  togglePinned: async () => {
    const pinned = !get().preferences.pinned;
    await setPinned(pinned);
    await get().updatePreferences({ pinned });
  },

  toggleVocabulary: async () => {
    const result = get().result;
    if (!result) return;
    const candidate = get().vocabularyCandidate;
    if (!candidate) {
      set({ vocabularyMessage: "生词本仅支持英文单词或短语" });
      return;
    }
    try {
      if (get().inVocabulary) {
        await removeVocabulary(candidate.term);
        set({ inVocabulary: false, vocabularyMessage: "已从生词本移除" });
      } else {
        await saveVocabulary(candidate);
        set({ inVocabulary: true, vocabularyMessage: "已加入生词本" });
      }
      await get().refreshVocabularyStats();
      if (get().libraryOpen) await get().refreshLibrary();
    } catch (error) {
      set({ vocabularyMessage: null, error: error instanceof Error ? error.message : String(error) });
    }
  },

  installLanguageModel: async (direction) => {
    const modelId = direction === "en-zh" ? "moyu-en-zh-q8-v1" : "moyu-zh-en-q8-v1";
    set((state) => ({
      error: null,
      modelStatuses: mergeModelStatus(state.modelStatuses, {
        id: modelId,
        state: "downloading",
        downloadedBytes: 0,
        totalBytes: 0,
      }),
    }));
    try {
      const status = await prepareModel(direction, (next) => {
        set((state) => ({ modelStatuses: mergeModelStatus(state.modelStatuses, next) }));
      });
      set((state) => ({ modelStatuses: mergeModelStatus(state.modelStatuses, status) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        error: message,
        modelStatuses: mergeModelStatus(state.modelStatuses, {
          id: modelId,
          state: "error",
          downloadedBytes: 0,
          totalBytes: 0,
          error: message,
        }),
      }));
    }
  },
  removeLanguageModel: async (direction) => {
    const status = await removeModel(direction);
    set((state) => ({ modelStatuses: mergeModelStatus(state.modelStatuses, status) }));
  },
}));

function vocabularyKey(term: string) {
  return normalizeVocabularyTerm(term).toLocaleLowerCase();
}

export function mergeModelStatus(statuses: ModelPackStatus[], next: ModelPackStatus) {
  const index = statuses.findIndex((status) => status.id === next.id);
  if (index < 0) return [...statuses, next];
  return statuses.map((status, current) => current === index ? next : status);
}

export { defaultPreferences, emptyVocabularyStats };
