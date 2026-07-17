/** @vitest-environment jsdom */

import type { SavedTranslation, TranslationResult } from "@moyu/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { isInVocabulary, listVocabulary, removeVocabulary, vocabularyStats } from "./bridge";

function result(sourceText: string, primaryText: string): TranslationResult {
  return {
    sourceText,
    primaryText,
    headword: sourceText,
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

function favorite(sourceText: string, primaryText: string): SavedTranslation {
  return {
    id: sourceText,
    kind: "favorite",
    storedAt: "2026-07-17T00:00:00Z",
    result: result(sourceText, primaryText),
  };
}

beforeEach(() => localStorage.clear());

describe("preview vocabulary migration", () => {
  it("preserves normalized legacy conflicts and removes them by exact entry id", async () => {
    localStorage.setItem("moyu-preview-favorites", JSON.stringify([
      favorite("ability", "能力"),
      favorite("Ability", "本领"),
      favorite("This is a complete sentence.", "这是一个完整句子。"),
    ]));

    const migrated = await listVocabulary();
    expect(migrated).toHaveLength(3);
    expect(await vocabularyStats()).toMatchObject({ total: 3, dueToday: 1, legacy: 2 });
    const legacyDuplicate = migrated.find((entry) => entry.term === "Ability" && !entry.reviewEligible);
    expect(legacyDuplicate).toBeDefined();

    await removeVocabulary(legacyDuplicate!.term, legacyDuplicate!.id);
    expect(await isInVocabulary("ability")).toBe(true);
    expect(await listVocabulary()).toHaveLength(2);

    await removeVocabulary("ability");
    expect(await isInVocabulary("ability")).toBe(false);
    expect(await listVocabulary()).toHaveLength(1);
  });
});
