import { describe, expect, it } from "vitest";
import { modelTotalBytes, verifiedModelManifests } from "./modelManifest";

describe("verified model manifests", () => {
  it("pins both language directions to immutable revisions", () => {
    for (const manifest of Object.values(verifiedModelManifests)) {
      expect(manifest.revision).toMatch(/^[a-f0-9]{40}$/u);
      expect(manifest.files).toHaveLength(6);
      expect(new Set(manifest.files.map((file) => file.path)).size).toBe(manifest.files.length);
    }
  });

  it("requires a sha256 and byte count for every cached file", () => {
    for (const manifest of Object.values(verifiedModelManifests)) {
      for (const file of manifest.files) {
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(file.bytes).toBeGreaterThan(0);
      }
    }
    expect(modelTotalBytes("en-zh")).toBeGreaterThan(100_000_000);
    expect(modelTotalBytes("zh-en")).toBeGreaterThan(100_000_000);
  });
});
