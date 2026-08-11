import { describe, expect, it } from "vitest";
import { defaultPreferences, mergeModelStatus } from "./useAppStore";

describe("default preferences", () => {
  it("keeps history opt-in and dictionary features enabled", () => {
    expect(defaultPreferences.historyEnabled).toBe(false);
    expect(defaultPreferences.autoPronounce).toBe(true);
    expect(defaultPreferences.dictionaryOptions.useOfflineDictionary).toBe(true);
    expect(defaultPreferences.dictionaryOptions.includeExamples).toBe(true);
  });

  it("uses the approved 350ms hold threshold", () => {
    expect(defaultPreferences.holdDurationMilliseconds).toBe(350);
  });

  it("updates one language model without dropping the other direction", () => {
    const statuses = [
      { id: "moyu-en-zh-q8-v1", state: "missing" as const, downloadedBytes: 0, totalBytes: 0 },
      { id: "moyu-zh-en-q8-v1", state: "ready" as const, downloadedBytes: 1, totalBytes: 1 },
    ];
    const next = mergeModelStatus(statuses, {
      id: "moyu-en-zh-q8-v1",
      state: "downloading",
      downloadedBytes: 50,
      totalBytes: 100,
    });
    expect(next).toHaveLength(2);
    expect(next[0]?.state).toBe("downloading");
    expect(next[1]?.state).toBe("ready");
  });
});
