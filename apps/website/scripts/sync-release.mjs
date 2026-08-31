import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const repository = "l3263254135-dotcom/Moyu-Translate";
const response = await fetch(`https://api.github.com/repos/${repository}/releases`, {
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "Moyu-Translate-Website",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  },
});
if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status}`);
const releases = await response.json();
const rootPackage = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
const expectedTag = `v${rootPackage.version}`;
const release = releases.find((item) => !item.draft && item.tag_name === expectedTag);
if (!release) throw new Error(`No published release found for ${expectedTag}`);

const asset = (suffix) => release.assets.find((item) => item.name.toLowerCase().endsWith(suffix));
const checksum = (target) => release.assets.find((item) => item.name === `${target?.name}.sha256`);
const dmg = asset(".dmg");
const exe = asset(".exe");
const msi = asset(".msi");
const manifest = {
  version: release.tag_name.replace(/^v/, ""),
  channel: release.prerelease ? "beta" : "stable",
  publishedAt: release.published_at,
  releaseUrl: release.html_url,
  requirements: {
    macos: "macOS 15+ · Apple Silicon / Intel",
    windows: "Windows 10 22H2 / Windows 11 · x64",
  },
  downloads: {
    ...(dmg ? { macos: { url: dmg.browser_download_url, sha256Url: checksum(dmg)?.browser_download_url ?? release.html_url, label: `macOS ${release.tag_name}`, architecture: "Universal" } } : {}),
    ...(exe ? { windowsExe: { url: exe.browser_download_url, sha256Url: checksum(exe)?.browser_download_url ?? release.html_url, label: `Windows ${release.tag_name}`, architecture: "x64" } } : {}),
    ...(msi ? { windowsMsi: { url: msi.browser_download_url, sha256Url: checksum(msi)?.browser_download_url ?? release.html_url, label: `Windows MSI ${release.tag_name}`, architecture: "x64" } } : {}),
  },
};

const output = fileURLToPath(new URL("../public/release-manifest.json", import.meta.url));
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced ${manifest.version} to ${output}`);
