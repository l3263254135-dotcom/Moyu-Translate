import type { SavedTranslation, TranslationResult, VocabularyEntry, VocabularyStats } from "@moyu/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  listSavedTranslations: vi.fn(),
  listVocabulary: vi.fn(),
  vocabularyStats: vi.fn(),
}));

vi.mock("../services/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/bridge")>()),
  ...bridgeMocks,
}));

import { useAppStore } from "./useAppStore";

const stats: VocabularyStats = { total: 1, dueToday: 1, mastered: 0, legacy: 0 };

function result(sourceText: string): TranslationResult {
  return {
    sourceText,
    primaryText: "测试",
    pronunciations: [],
    senses: [],
    forms: [],
    examples: [],
    relations: [],
    vocabularyTags: [],
    sources: [],
    provider: "test",
    latencyMilliseconds: 1,
  };
}

function vocabularyEntry(term: string): VocabularyEntry {
  return {
    id: term,
    term,
    definition: "测试",
    addedAt: "2026-07-17T00:00:00Z",
    reviewStage: 0,
    reviewCount: 0,
    lapseCount: 0,
    nextReviewAt: "2026-07-17T00:00:00Z",
    reviewEligible: true,
    result: result(term),
  };
}

function historyEntry(sourceText: string): SavedTranslation {
  return {
    id: sourceText,
    kind: "history",
    storedAt: "2026-07-17T00:00:00Z",
    result: result(sourceText),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    libraryOpen: true,
    libraryKind: "favorite",
    libraryQuery: "",
    vocabularyFilter: "all",
    vocabularyEntries: [],
    savedTranslations: [],
    vocabularyStats: { total: 0, dueToday: 0, mastered: 0, legacy: 0 },
    libraryWorking: false,
    error: null,
  });
});

describe("library request ordering", () => {
  it("does not let an older vocabulary response overwrite the current history view", async () => {
    const oldVocabulary = deferred<VocabularyEntry[]>();
    bridgeMocks.listVocabulary.mockReturnValueOnce(oldVocabulary.promise);
    bridgeMocks.vocabularyStats.mockResolvedValueOnce(stats);
    const firstRequest = useAppStore.getState().refreshLibrary();

    const history = [historyEntry("new history")];
    bridgeMocks.listSavedTranslations.mockResolvedValueOnce(history);
    await useAppStore.getState().setLibraryKind("history");
    expect(useAppStore.getState()).toMatchObject({
      libraryKind: "history",
      savedTranslations: history,
      vocabularyEntries: [],
      libraryWorking: false,
    });

    oldVocabulary.resolve([vocabularyEntry("stale vocabulary")]);
    await firstRequest;
    expect(useAppStore.getState()).toMatchObject({
      libraryKind: "history",
      savedTranslations: history,
      vocabularyEntries: [],
      libraryWorking: false,
    });
  });

  it("lets only the newest request clear the loading state", async () => {
    const oldVocabulary = deferred<VocabularyEntry[]>();
    bridgeMocks.listVocabulary.mockReturnValueOnce(oldVocabulary.promise);
    bridgeMocks.vocabularyStats.mockResolvedValueOnce(stats);
    const firstRequest = useAppStore.getState().refreshLibrary();

    const latestHistory = deferred<SavedTranslation[]>();
    bridgeMocks.listSavedTranslations.mockReturnValueOnce(latestHistory.promise);
    const latestRequest = useAppStore.getState().setLibraryKind("history");
    oldVocabulary.resolve([vocabularyEntry("stale vocabulary")]);
    await firstRequest;
    expect(useAppStore.getState().libraryWorking).toBe(true);

    latestHistory.resolve([historyEntry("latest history")]);
    await latestRequest;
    expect(useAppStore.getState().libraryWorking).toBe(false);
  });
});
