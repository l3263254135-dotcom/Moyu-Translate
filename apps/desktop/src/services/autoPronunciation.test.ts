import type { TranslationResult } from "@moyu/contracts";
import { describe, expect, it } from "vitest";
import { automaticPronunciationText } from "./autoPronunciation";

function result(sourceText: string, headword?: string): TranslationResult {
  return {
    sourceText,
    primaryText: "测试释义",
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

describe("automatic pronunciation", () => {
  it("speaks English words and phrases", () => {
    expect(automaticPronunciationText(result("ability"))).toBe("ability");
    expect(automaticPronunciationText(result("take a break"))).toBe("take a break");
  });

  it("prefers a normalized dictionary headword", () => {
    expect(automaticPronunciationText(result("Abilities", "ability"))).toBe("ability");
  });

  it("does not speak complete sentences or Chinese queries", () => {
    expect(automaticPronunciationText(result("I want to go home"))).toBeNull();
    expect(automaticPronunciationText(result("This is a test"))).toBeNull();
    expect(automaticPronunciationText(result("Are you ready"))).toBeNull();
    expect(automaticPronunciationText(result("休息一下", "take a break"))).toBeNull();
  });
});
