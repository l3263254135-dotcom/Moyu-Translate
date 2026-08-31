import { describe, expect, it } from "vitest";
import { validateQueryInput } from "./queryValidation";

describe("validateQueryInput", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["!!!???", "symbols"],
    ["aaaaaa", "repeated"],
    ["bcdfghjklmnpqrstvwxyz", "gibberish"],
    ["ab".repeat(41), "too-long"],
  ] as const)("rejects %j as %s", (text, reason) => {
    expect(validateQueryInput(text)).toMatchObject({ valid: false, reason });
  });

  it.each(["API", "RAG", "WebGPU2", "x86_64", "speedrun", "look up a word", "This is a complete sentence."]) (
    "allows %j",
    (text) => expect(validateQueryInput(text).valid).toBe(true),
  );

  it("trims and merges whitespace", () => {
    expect(validateQueryInput("  look   up  ")).toMatchObject({ valid: true, normalized: "look up" });
  });
});
