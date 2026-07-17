import type { ReleaseManifest } from "@moyu/contracts";
import { Apple, Download, MonitorDown } from "lucide-react";
import { useEffect, useState } from "react";

export function DownloadButtons({ manifest, lang, compact = false }: { manifest: ReleaseManifest; lang: "zh" | "en"; compact?: boolean }) {
  const [platform, setPlatform] = useState<"macos" | "windows" | "other">("other");
  useEffect(() => {
    const value = navigator.userAgent.toLowerCase();
    setPlatform(value.includes("windows") ? "windows" : value.includes("mac") ? "macos" : "other");
  }, []);
  const mac = manifest.downloads.macos;
  const windows = manifest.downloads.windowsExe ?? manifest.downloads.windowsMsi;
  return (
    <div className={`download-buttons ${compact ? "is-compact" : ""}`}>
      <a className={`download-button ${platform === "macos" ? "is-recommended" : ""}`} href={mac?.url ?? manifest.releaseUrl}>
        <Apple aria-hidden="true" />
        <span><strong>{lang === "zh" ? "下载 macOS 版" : "Download for macOS"}</strong><small>{manifest.requirements.macos}</small></span>
        <Download aria-hidden="true" />
      </a>
      <a className={`download-button download-button--windows ${platform === "windows" ? "is-recommended" : ""}`} href={windows?.url ?? manifest.releaseUrl}>
        <MonitorDown aria-hidden="true" />
        <span><strong>{lang === "zh" ? "下载 Windows 版" : "Download for Windows"}</strong><small>{manifest.requirements.windows}</small></span>
        <Download aria-hidden="true" />
      </a>
    </div>
  );
}
