import type {
  AppPreferences,
  ModelPackStatus,
  PlatformCapabilities,
  SavedTranslation,
  SavedTranslationKind,
  TranslationResult,
} from "@moyu/contracts";
import { create } from "zustand";
import {
  captureAtCursor,
  clearHistory,
  favoriteState,
  launchAtLoginEnabled,
  listSavedTranslations,
  loadPreferences,
  modelStatus,
  platformCapabilities,
  prepareModel,
  removeModel,
  savePreferences,
  setLaunchAtLogin,
  setPinned,
  toggleFavorite,
  translate,
} from "../services/bridge";

const defaultPreferences: AppPreferences = {
  enabled: true,
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

interface AppState {
  query: string;
  result: TranslationResult | null;
  error: string | null;
  working: boolean;
  favorite: boolean;
  settingsOpen: boolean;
  libraryOpen: boolean;
  libraryKind: SavedTranslationKind;
  libraryQuery: string;
  savedTranslations: SavedTranslation[];
  libraryWorking: boolean;
  preferences: AppPreferences;
  capabilities: PlatformCapabilities | null;
  modelStatuses: ModelPackStatus[];
  setQuery: (query: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => Promise<void>;
  setLibraryKind: (kind: SavedTranslationKind) => Promise<void>;
  setLibraryQuery: (query: string) => void;
  refreshSavedTranslations: () => Promise<void>;
  clearHistory: () => Promise<void>;
  removeFavorite: (result: TranslationResult) => Promise<void>;
  openSavedTranslation: (saved: SavedTranslation) => Promise<void>;
  initialize: () => Promise<void>;
  submit: () => Promise<void>;
  capture: () => Promise<void>;
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  toggleTheme: () => Promise<void>;
  togglePinned: () => Promise<void>;
  toggleFavorite: () => Promise<void>;
  installLanguageModel: (direction: "en-zh" | "zh-en") => Promise<void>;
  removeLanguageModel: (direction: "en-zh" | "zh-en") => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  query: "",
  result: null,
  error: null,
  working: false,
  favorite: false,
  settingsOpen: false,
  libraryOpen: false,
  libraryKind: "favorite",
  libraryQuery: "",
  savedTranslations: [],
  libraryWorking: false,
  preferences: defaultPreferences,
  capabilities: null,
  modelStatuses: [],

  setQuery: (query) => set({ query }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen, libraryOpen: false }),
  setLibraryOpen: async (libraryOpen) => {
    set({ libraryOpen, settingsOpen: false });
    if (libraryOpen) await get().refreshSavedTranslations();
  },
  setLibraryKind: async (libraryKind) => {
    set({ libraryKind, libraryQuery: "" });
    await get().refreshSavedTranslations();
  },
  setLibraryQuery: (libraryQuery) => set({ libraryQuery }),
  refreshSavedTranslations: async () => {
    set({ libraryWorking: true });
    try {
      const savedTranslations = await listSavedTranslations(get().libraryKind, get().libraryQuery);
      set({ savedTranslations });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ libraryWorking: false });
    }
  },
  clearHistory: async () => {
    await clearHistory();
    await get().refreshSavedTranslations();
  },
  removeFavorite: async (result) => {
    await toggleFavorite(result, false);
    if (get().result?.sourceText === result.sourceText) set({ favorite: false });
    await get().refreshSavedTranslations();
  },
  openSavedTranslation: async (saved) => {
    const favorite = await favoriteState(saved.result.sourceText);
    set({
      query: saved.result.sourceText,
      result: saved.result,
      error: null,
      favorite,
      libraryOpen: false,
      settingsOpen: false,
    });
  },

  initialize: async () => {
    const [stored, capabilities, statuses, launchAtLogin] = await Promise.all([
      loadPreferences(),
      platformCapabilities(),
      modelStatus(),
      launchAtLoginEnabled(),
    ]);
    const preferences = { ...(stored ?? defaultPreferences), launchAtLogin };
    set({ preferences, capabilities, modelStatuses: statuses });
  },

  submit: async () => {
    const text = get().query.trim();
    if (!text) {
      set({ error: "请输入要查询的英文或中文", result: null });
      return;
    }
    set({ working: true, error: null, favorite: false });
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
        (status) => set((state) => ({ modelStatuses: mergeModelStatus(state.modelStatuses, status) })),
      );
      const favorite = await favoriteState(result.sourceText);
      set({ result, favorite });
    } catch (error) {
      set({ result: null, error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ working: false });
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

  toggleFavorite: async () => {
    const result = get().result;
    if (!result) return;
    const favorite = !get().favorite;
    await toggleFavorite(result, favorite);
    set({ favorite });
    if (get().libraryOpen) await get().refreshSavedTranslations();
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

export function mergeModelStatus(statuses: ModelPackStatus[], next: ModelPackStatus) {
  const index = statuses.findIndex((status) => status.id === next.id);
  if (index < 0) return [...statuses, next];
  return statuses.map((status, current) => current === index ? next : status);
}

export { defaultPreferences };
