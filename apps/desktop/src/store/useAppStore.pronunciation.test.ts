import type { TranslationResult } from "@moyu/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  isInVocabulary: vi.fn(),
  resolveVocabularyCandidate: vi.fn(),
  speak: vi.fn(),
  translate: vi.fn(),
}));

vi.mock("../services/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/bridge")>()),
  ...bridgeMocks,
}));

import { defaultPreferences, useAppStore } from "./useAppStore";

function result(sourceText: string, headword?: string): TranslationResult {
  return {
    sourceText,
    headword,
    primaryText: "测试释义",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridgeMocks.resolveVocabularyCandidate.mockResolvedValue(null);
  bridgeMocks.isInVocabulary.mockResolvedValue(false);
  bridgeMocks.speak.mockResolvedValue(undefined);
  useAppStore.setState({
    query: "ability",
    result: null,
    error: null,
    working: false,
    inVocabulary: false,
    vocabularyCandidate: null,
    preferences: { ...defaultPreferences, autoPronounce: true },
    capabilities: {
      platform: "macos",
      triggerKeyLabel: "Option",
      accessibility: "granted",
      screenCapture: "granted",
      hotkeyStatus: "ready",
      textToSpeech: true,
      platformDictionary: true,
      launchAtLogin: false,
    },
  });
});

describe("automatic pronunciation after translation", () => {
  it("rejects obvious gibberish without starting a translation", async () => {
    useAppStore.setState({ query: "bcdfghjklmnpqrstvwxyz" });

    await useAppStore.getState().submit();

    expect(bridgeMocks.translate).not.toHaveBeenCalled();
    expect(useAppStore.getState()).toMatchObject({ working: false, result: null });
    expect(useAppStore.getState().error).toContain("有效单词或短句");
  });

  it("clears working after the watchdog timeout", async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<TranslationResult>();
      bridgeMocks.translate.mockReturnValue(pending.promise);
      const submission = useAppStore.getState().submit();
      await vi.advanceTimersByTimeAsync(15_000);
      pending.resolve(result("late", "late"));
      await submission;
      expect(useAppStore.getState()).toMatchObject({ working: false, error: "查询超时，请重试" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("can retry immediately after a failed query", async () => {
    bridgeMocks.translate
      .mockRejectedValueOnce(new Error("worker failed"))
      .mockResolvedValueOnce(result("ability", "ability"));

    await useAppStore.getState().submit();
    expect(useAppStore.getState().working).toBe(false);
    await useAppStore.getState().submit();

    expect(useAppStore.getState().result?.headword).toBe("ability");
    expect(bridgeMocks.translate).toHaveBeenCalledTimes(2);
  });

  it("speaks the normalized headword exactly once", async () => {
    bridgeMocks.translate.mockResolvedValue(result("Abilities", "ability"));
    useAppStore.setState({ query: "Abilities" });

    await useAppStore.getState().submit();

    expect(bridgeMocks.speak).toHaveBeenCalledOnce();
    expect(bridgeMocks.speak).toHaveBeenCalledWith("ability", "en-US");
  });

  it("does not speak when automatic pronunciation is disabled", async () => {
    bridgeMocks.translate.mockResolvedValue(result("ability", "ability"));
    useAppStore.setState({
      preferences: { ...defaultPreferences, autoPronounce: false },
    });

    await useAppStore.getState().submit();

    expect(bridgeMocks.speak).not.toHaveBeenCalled();
  });

  it("does not speak complete English sentences", async () => {
    bridgeMocks.translate.mockResolvedValue(result("This is a test"));
    useAppStore.setState({ query: "This is a test" });

    await useAppStore.getState().submit();

    expect(bridgeMocks.speak).not.toHaveBeenCalled();
  });

  it("keeps and speaks only the latest overlapping query", async () => {
    const firstTranslation = deferred<TranslationResult>();
    const secondTranslation = deferred<TranslationResult>();
    bridgeMocks.translate
      .mockReturnValueOnce(firstTranslation.promise)
      .mockReturnValueOnce(secondTranslation.promise);

    useAppStore.getState().setQuery("ability");
    const firstSubmit = useAppStore.getState().submit();
    useAppStore.getState().setQuery("capacity");
    const secondSubmit = useAppStore.getState().submit();

    const latest = result("capacity", "capacity");
    secondTranslation.resolve(latest);
    await secondSubmit;
    firstTranslation.resolve(result("ability", "ability"));
    await firstSubmit;

    expect(useAppStore.getState().result).toBe(latest);
    expect(bridgeMocks.speak).toHaveBeenCalledOnce();
    expect(bridgeMocks.speak).toHaveBeenCalledWith("capacity", "en-US");
  });

  it("aborts the previous request when a new query starts", async () => {
    const firstTranslation = deferred<TranslationResult>();
    let firstSignal: AbortSignal | undefined;
    bridgeMocks.translate.mockImplementationOnce((_request, _progress, signal) => {
      firstSignal = signal;
      return firstTranslation.promise;
    }).mockResolvedValueOnce(result("capacity", "capacity"));

    useAppStore.getState().setQuery("ability");
    const firstSubmit = useAppStore.getState().submit();
    useAppStore.getState().setQuery("capacity");
    await useAppStore.getState().submit();
    firstTranslation.resolve(result("ability", "ability"));
    await firstSubmit;

    expect(firstSignal?.aborted).toBe(true);
  });

  it("does not let a saved translation overwrite a newer query", async () => {
    const savedCandidate = deferred<null>();
    bridgeMocks.resolveVocabularyCandidate.mockReturnValueOnce(savedCandidate.promise);
    const savedResult = result("ability", "ability");
    const openSaved = useAppStore.getState().openSavedTranslation({
      id: "saved-ability",
      kind: "history",
      storedAt: "2026-08-11T00:00:00Z",
      result: savedResult,
    });

    const latest = result("capacity", "capacity");
    bridgeMocks.translate.mockResolvedValueOnce(latest);
    useAppStore.getState().setQuery("capacity");
    await useAppStore.getState().submit();
    savedCandidate.resolve(null);
    await openSaved;

    expect(useAppStore.getState().result).toBe(latest);
    expect(useAppStore.getState().query).toBe("capacity");
  });

  it("keeps the translation result when system speech fails", async () => {
    const translated = result("ability", "ability");
    bridgeMocks.translate.mockResolvedValue(translated);
    bridgeMocks.speak.mockRejectedValue(new Error("speech unavailable"));

    await useAppStore.getState().submit();
    await Promise.resolve();

    expect(useAppStore.getState()).toMatchObject({ result: translated, error: null });
  });
});
