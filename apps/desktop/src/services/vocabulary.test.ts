import type { TranslationResult, VocabularyEntry } from "@moyu/contracts";
import { describe, expect, it } from "vitest";
import {
  isVocabularyTerm,
  dueReviewEntryAt,
  nextReviewSchedule,
  normalizeVocabularyTerm,
  shouldRequeueReview,
  takeReviewBatch,
  vocabularyCandidateFromResult,
} from "./vocabulary";

function result(sourceText: string, primaryText: string, headword?: string): TranslationResult {
  return {
    sourceText,
    primaryText,
    headword,
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

function entry(term: string, nextReviewAt: string, reviewEligible = true): VocabularyEntry {
  return {
    id: term,
    term,
    definition: "测试",
    addedAt: "2026-07-01T00:00:00Z",
    reviewStage: 0,
    reviewCount: 0,
    lapseCount: 0,
    nextReviewAt,
    reviewEligible,
    result: result(term, "测试"),
  };
}

describe("vocabulary candidates", () => {
  it("accepts English words and phrases and normalizes spaces", () => {
    expect(isVocabularyTerm("ability")).toBe(true);
    expect(isVocabularyTerm("  take   a break ")).toBe(true);
    expect(normalizeVocabularyTerm("  take   a break ")).toBe("take a break");
  });

  it("rejects sentences, non-English text, and phrases over eight words", () => {
    expect(isVocabularyTerm("This is a sentence.")).toBe(false);
    expect(isVocabularyTerm("This is a test")).toBe(false);
    expect(isVocabularyTerm("Are you ready")).toBe(false);
    expect(isVocabularyTerm("What is this")).toBe(false);
    expect(isVocabularyTerm("I want to go home")).toBe(false);
    expect(isVocabularyTerm("Cats are lovely animals")).toBe(false);
    expect(isVocabularyTerm("Moyu makes translation easy")).toBe(false);
    expect(isVocabularyTerm("Birds eat small insects")).toBe(false);
    expect(isVocabularyTerm("Children enjoy sunny days")).toBe(false);
    expect(isVocabularyTerm("John went home")).toBe(false);
    expect(isVocabularyTerm("The young child went home")).toBe(false);
    expect(isVocabularyTerm("A small bird flew away")).toBe(false);
    expect(isVocabularyTerm("Dogs book flights online")).toBe(false);
    expect(isVocabularyTerm("dogs book flights online")).toBe(false);
    expect(isVocabularyTerm("people fish in rivers")).toBe(false);
    expect(isVocabularyTerm("苹果")).toBe(false);
    expect(isVocabularyTerm("one two three four five six seven eight nine")).toBe(false);
    expect(isVocabularyTerm("you and me")).toBe(true);
    expect(isVocabularyTerm("machine learning model")).toBe(true);
    expect(isVocabularyTerm("natural language processing")).toBe(true);
    expect(isVocabularyTerm("distributed systems architecture")).toBe(true);
    expect(isVocabularyTerm("customer needs analysis")).toBe(true);
    expect(isVocabularyTerm("Customer Needs Analysis")).toBe(true);
    expect(isVocabularyTerm("operations research method")).toBe(true);
    expect(isVocabularyTerm("United States government")).toBe(true);
  });

  it("stores the English result for Chinese-to-English queries", () => {
    expect(vocabularyCandidateFromResult(result("休息一下", "take a break"))).toMatchObject({
      term: "take a break",
      definition: "休息一下",
      originalSourceText: "休息一下",
    });
    expect(vocabularyCandidateFromResult(result("我想回家", "I want to go home"))).toBeNull();
  });

  it("prefers a dictionary headword for English queries", () => {
    expect(vocabularyCandidateFromResult(result("Abilities", "能力", "ability"))).toMatchObject({
      term: "ability",
      definition: "能力",
    });
  });
});

describe("review batches", () => {
  it("keeps only due eligible entries, sorted by due time, and caps the batch", () => {
    const entries = Array.from({ length: 24 }, (_, index) => entry(`word${index}`, `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`));
    entries.push(entry("future", "2026-08-01T00:00:00Z"));
    entries.push(entry("legacy", "2026-07-01T00:00:00Z", false));
    const batch = takeReviewBatch(entries, new Date("2026-07-31T00:00:00Z"));
    expect(batch).toHaveLength(20);
    expect(batch[0]?.term).toBe("word0");
    expect(batch.some((item) => item.term === "legacy")).toBe(false);
  });

  it("uses fixed intervals and resets forgotten terms for ten minutes", () => {
    const reviewedAt = new Date("2026-07-17T00:00:00Z");
    expect(nextReviewSchedule(0, "known", reviewedAt)).toMatchObject({
      reviewStage: 1,
      nextReviewAt: "2026-07-18T00:00:00.000Z",
      lapseIncrement: 0,
    });
    expect(nextReviewSchedule(4, "known", reviewedAt)).toMatchObject({
      reviewStage: 5,
      nextReviewAt: "2026-08-16T00:00:00.000Z",
    });
    expect(nextReviewSchedule(3, "again", reviewedAt)).toMatchObject({
      reviewStage: 0,
      nextReviewAt: "2026-07-17T00:10:00.000Z",
      lapseIncrement: 1,
    });
  });

  it("requeues a forgotten card at most once in one review round", () => {
    expect(shouldRequeueReview("Take a Break", "again", [])).toBe(true);
    expect(shouldRequeueReview("Take a Break", "again", ["take a break"])).toBe(false);
    expect(shouldRequeueReview("Take a Break", "known", [])).toBe(false);
  });

  it("does not show a requeued card before its ten-minute due time", () => {
    const future = entry("ability", "2026-07-17T00:10:00Z");
    expect(dueReviewEntryAt([future], 0, new Date("2026-07-17T00:00:01Z"))).toBeUndefined();
    expect(dueReviewEntryAt([future], 0, new Date("2026-07-17T00:10:00Z"))?.term).toBe("ability");
  });
});
