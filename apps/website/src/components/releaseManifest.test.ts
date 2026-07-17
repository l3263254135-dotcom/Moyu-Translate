import { describe, expect, it } from "vitest";
import manifest from "../../public/release-manifest.json";

describe("release manifest", () => {
  it("always exposes both platform paths", () => {
    expect(manifest.downloads.macos.url).toContain("github.com");
    expect(manifest.downloads.windowsExe.url).toContain("github.com");
  });

  it("documents supported systems", () => {
    expect(manifest.requirements.macos).toContain("macOS 15");
    expect(manifest.requirements.windows).toContain("Windows 10");
  });
});
