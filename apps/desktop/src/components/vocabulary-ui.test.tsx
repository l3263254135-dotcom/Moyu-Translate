/** @vitest-environment jsdom */

import type { TranslationResult, VocabularyEntry } from "@moyu/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../store/useAppStore";
import { LibraryView } from "./LibraryView";
import { ResultView } from "./ResultView";
import { VocabularyReview } from "./VocabularyReview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function result(sourceText = "ability", primaryText = "能力"): TranslationResult {
  return {
    sourceText,
    primaryText,
    headword: sourceText,
    pronunciations: [{ locale: "general", ipa: "əˈbɪləti", source: "test" }],
    senses: [{ id: "sense", partOfSpeech: "n.", meanings: [primaryText], source: "test" }],
    forms: [],
    examples: [{ id: "example", english: "Ability matters.", chinese: "能力很重要。", source: "test" }],
    relations: [],
    vocabularyTags: [],
    sources: [],
    provider: "test",
    latencyMilliseconds: 1,
  };
}

function entry(): VocabularyEntry {
  return {
    id: "ability",
    term: "ability",
    definition: "能力",
    addedAt: "2026-07-17T00:00:00Z",
    reviewStage: 0,
    reviewCount: 0,
    lapseCount: 0,
    nextReviewAt: "2026-07-17T00:00:00Z",
    reviewEligible: true,
    result: result(),
  };
}

describe("vocabulary result action", () => {
  it("offers a vocabulary action for words and disables it for sentences", () => {
    const wordResult = result();
    useAppStore.setState({
      result: wordResult,
      inVocabulary: false,
      vocabularyCandidate: { term: "ability", definition: "能力", originalSourceText: "ability", result: wordResult },
      vocabularyMessage: null,
    });
    const word = render(<ResultView />);
    expect(word.container.querySelector('button[aria-label="加入生词本"]')).not.toBeNull();
    word.unmount();

    useAppStore.setState({ result: result("This is a complete sentence.", "这是一个完整句子。"), vocabularyCandidate: null });
    const sentence = render(<ResultView />);
    expect(sentence.container.querySelector<HTMLButtonElement>('button[aria-label="加入生词本"]')?.disabled).toBe(true);
    sentence.unmount();
  });
});

describe("vocabulary library", () => {
  it("shows a useful empty state", () => {
    useAppStore.setState({
      reviewOpen: false,
      libraryKind: "favorite",
      libraryQuery: "",
      vocabularyFilter: "all",
      vocabularyEntries: [],
      vocabularyStats: { total: 0, dueToday: 0, mastered: 0, legacy: 0 },
      libraryWorking: false,
    });
    const view = render(<LibraryView />);
    expect(view.container.textContent).toContain("查词后点击星标，把单词加入生词本");
    view.unmount();
  });

  it("labels a large due queue with the twenty-card round limit", () => {
    useAppStore.setState({
      reviewOpen: false,
      reviewWorking: false,
      libraryKind: "favorite",
      libraryQuery: "",
      vocabularyFilter: "all",
      vocabularyEntries: [entry()],
      vocabularyStats: { total: 25, dueToday: 25, mastered: 0, legacy: 0 },
      libraryWorking: false,
    });
    const view = render(<LibraryView />);
    expect(view.container.textContent).toContain("开始复习 20");
    expect(view.container.textContent).not.toContain("开始复习 25");
    view.unmount();
  });
});

describe("vocabulary review card", () => {
  it("reveals the answer and reaches the completion state", () => {
    useAppStore.setState({
      reviewQueue: [entry()],
      reviewIndex: 0,
      reviewInitialCount: 1,
      reviewCompletedCount: 0,
      reviewRevealed: false,
      reviewWorking: false,
    });
    const front = render(<VocabularyReview />);
    expect(front.container.textContent).toContain("显示释义");
    expect(front.container.textContent).not.toContain("能力很重要");
    front.unmount();

    useAppStore.setState({ reviewRevealed: true });
    const back = render(<VocabularyReview />);
    expect(back.container.textContent).toContain("能力很重要");
    expect(back.container.textContent).toContain("不认识");
    expect(back.container.textContent).toContain("认识");
    back.unmount();

    useAppStore.setState({ reviewIndex: 1, reviewCompletedCount: 1 });
    const complete = render(<VocabularyReview />);
    expect(complete.container.textContent).toContain("本轮复习完成");
    expect(complete.container.textContent).toContain("已处理 1 张卡片");
    complete.unmount();
  });

  it("does not immediately show a forgotten card scheduled ten minutes later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T00:00:00Z"));
    const future = { ...entry(), nextReviewAt: "2026-07-17T00:10:00Z" };
    useAppStore.setState({
      reviewQueue: [future],
      reviewIndex: 0,
      reviewInitialCount: 1,
      reviewCompletedCount: 1,
      reviewRevealed: false,
      reviewWorking: false,
    });
    const view = render(<VocabularyReview />);
    expect(view.container.textContent).toContain("本轮复习完成");
    expect(view.container.textContent).not.toContain("显示释义");

    act(() => vi.advanceTimersByTime(10 * 60 * 1_000 + 25));
    expect(view.container.textContent).toContain("显示释义");
    expect(view.container.textContent).not.toContain("本轮复习完成");
    expect(view.container.textContent).toContain("2/2");

    act(() => useAppStore.setState({ reviewIndex: 1, reviewCompletedCount: 2 }));
    expect(view.container.textContent).toContain("本轮复习完成");
    expect(view.container.textContent).toContain("2/2");
    expect(view.container.textContent).toContain("已处理 2 张卡片");
    view.unmount();
    vi.useRealTimers();
  });

  it("shows a requeued card that became due while other cards were being reviewed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T00:00:00Z"));
    const first = entry();
    const requeued = {
      ...entry(),
      id: "forgotten",
      term: "forgotten",
      nextReviewAt: "2026-07-17T00:10:00Z",
    };
    useAppStore.setState({
      reviewQueue: [first, requeued],
      reviewIndex: 0,
      reviewInitialCount: 1,
      reviewCompletedCount: 0,
      reviewRevealed: false,
      reviewWorking: false,
    });
    const view = render(<VocabularyReview />);

    vi.setSystemTime(new Date("2026-07-17T00:11:00Z"));
    act(() => useAppStore.setState({ reviewIndex: 1, reviewCompletedCount: 1 }));
    expect(view.container.textContent).toContain("forgotten");
    expect(view.container.textContent).toContain("显示释义");
    view.unmount();
    vi.useRealTimers();
  });
});

afterEach(() => {
  vi.useRealTimers();
  useAppStore.setState({
    result: null,
    vocabularyCandidate: null,
    reviewOpen: false,
    reviewQueue: [],
    reviewIndex: 0,
    reviewInitialCount: 0,
    reviewCompletedCount: 0,
    reviewRevealed: false,
    reviewWorking: false,
  });
  document.body.replaceChildren();
});

function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    unmount: () => act(() => root.unmount()),
  };
}
