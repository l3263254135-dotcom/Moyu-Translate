import { describe, expect, it } from "vitest";
import { withBase } from "./paths";

describe("GitHub Pages base paths", () => {
  it("joins routes when Astro base has no trailing slash", () => {
    expect(withBase("/Moyu-Translate", "en")).toBe("/Moyu-Translate/en/");
    expect(withBase("/Moyu-Translate", "en/guide")).toBe("/Moyu-Translate/en/guide/");
  });

  it("keeps exactly one separator", () => {
    expect(withBase("/Moyu-Translate/", "/guide/")) .toBe("/Moyu-Translate/guide/");
    expect(withBase("/Moyu-Translate/")) .toBe("/Moyu-Translate/");
  });
});
