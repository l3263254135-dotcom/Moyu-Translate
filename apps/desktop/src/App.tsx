import { MoyuMark } from "@moyu/ui";
import { BookMarked, Crosshair, LoaderCircle, Moon, Pin, Settings, Sun, Undo2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { hidePanel, isTauriRuntime, platformCapabilities } from "./services/bridge";
import { ResultView } from "./components/ResultView";
import { LibraryView } from "./components/LibraryView";
import { SettingsView } from "./components/SettingsView";
import { useAppStore } from "./store/useAppStore";

export function App() {
  const input = useRef<HTMLInputElement>(null);
  const query = useAppStore((state) => state.query);
  const setQuery = useAppStore((state) => state.setQuery);
  const submit = useAppStore((state) => state.submit);
  const capture = useAppStore((state) => state.capture);
  const initialize = useAppStore((state) => state.initialize);
  const preferences = useAppStore((state) => state.preferences);
  const working = useAppStore((state) => state.working);
  const error = useAppStore((state) => state.error);
  const result = useAppStore((state) => state.result);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const libraryOpen = useAppStore((state) => state.libraryOpen);
  const vocabularyStats = useAppStore((state) => state.vocabularyStats);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setLibraryOpen = useAppStore((state) => state.setLibraryOpen);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const togglePinned = useAppStore((state) => state.togglePinned);
  const capabilities = useAppStore((state) => state.capabilities);
  const setCapabilities = useAppStore((state) => state.setCapabilities);

  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    const effective = preferences.theme === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preferences.theme;
    document.documentElement.dataset.theme = effective;
  }, [preferences.theme]);
  useEffect(() => { if (!settingsOpen && !libraryOpen) input.current?.focus(); }, [libraryOpen, settingsOpen]);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlistenFocus: (() => void) | undefined;
    let unlistenTrigger: (() => void) | undefined;
    let unlistenHotkeyStatus: (() => void) | undefined;
    void Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/api/event"),
    ]).then(async ([windowApi, eventApi]) => {
      unlistenFocus = await windowApi.getCurrentWindow().onFocusChanged(({ payload }) => {
        if (!payload && !useAppStore.getState().preferences.pinned) void hidePanel();
      });
      unlistenTrigger = await eventApi.listen("moyu://trigger", () => {
        window.setTimeout(() => input.current?.focus(), 0);
      });
      unlistenHotkeyStatus = await eventApi.listen<string>("moyu://hotkey-status", ({ payload }) => {
        const hotkeyStatus = payload as NonNullable<typeof capabilities>["hotkeyStatus"];
        setCapabilities({ hotkeyStatus });
        if (hotkeyStatus === "ready" || hotkeyStatus === "permission-required") {
          void platformCapabilities().then((next) => setCapabilities(next));
        }
      });
      // The native monitor can become ready before React finishes mounting;
      // query the current capability snapshot after registering the listener.
      const currentCapabilities = await platformCapabilities();
      setCapabilities(currentCapabilities);
    });
    return () => {
      unlistenFocus?.();
      unlistenTrigger?.();
      unlistenHotkeyStatus?.();
    };
  }, [setCapabilities]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !preferences.pinned) void hidePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preferences.pinned]);

  if (settingsOpen) return <main className="panel-shell"><SettingsView /></main>;
  if (libraryOpen) return <main className="panel-shell"><LibraryView /></main>;

  return (
    <main className="panel-shell">
      <header className="panel-header" data-tauri-drag-region>
        <div className="panel-brand" data-tauri-drag-region>
          <MoyuMark width={24} height={24} />
          <span>Moyu Translate</span>
        </div>
        <div className="panel-tools">
          <ToolButton label="读取光标文字" onClick={capture}><Crosshair /></ToolButton>
          <ToolButton
            label={vocabularyStats.dueToday > 0 ? `生词本与历史，今日待复习 ${vocabularyStats.dueToday} 个` : "生词本与历史"}
            badge={vocabularyStats.dueToday}
            onClick={() => setLibraryOpen(true)}
          ><BookMarked /></ToolButton>
          <ToolButton label="切换主题" onClick={toggleTheme}>{preferences.theme === "dark" ? <Sun /> : <Moon />}</ToolButton>
          <ToolButton label={preferences.pinned ? "取消固定" : "固定窗口"} active={preferences.pinned} onClick={togglePinned}><Pin /></ToolButton>
          <ToolButton label="设置" onClick={() => setSettingsOpen(true)}><Settings /></ToolButton>
        </div>
      </header>

      <section className="panel-content">
        <form className="query-row" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入英文或中文" aria-label="翻译文本" />
          <button type="submit" aria-label="翻译" disabled={working}>
            {working ? <LoaderCircle className="spin" /> : <Undo2 />}
          </button>
        </form>

        <div className="status-line">
          <span>{/[\u3400-\u9fff]/u.test(query) ? "简体中文 → EN" : "EN → 简体中文"} · 本地</span>
          <span>{capabilities?.platform === "windows" ? "Windows" : capabilities?.platform === "macos" ? "macOS" : "预览"}</span>
        </div>

        {error && <div className="error-message">{error}</div>}
        {!error && result && <ResultView />}
        {!error && !result && (
          <div className="empty-state">
            <MoyuMark width={48} height={48} />
            <p>将光标停在文字上，长按 <kbd>{capabilities?.triggerKeyLabel ?? "Option"}</kbd></p>
            <span>也可以直接输入单词或句子</span>
          </div>
        )}
      </section>
    </main>
  );
}

function ToolButton({ label, badge = 0, active = false, onClick, children }: { label: string; badge?: number; active?: boolean; onClick: () => void | Promise<void>; children: ReactNode }) {
  return (
    <button className={`tool-button ${active ? "is-active" : ""}`} type="button" aria-label={label} title={label} onClick={() => void onClick()}>
      {children}
      {badge > 0 && <span className="tool-button__badge" aria-hidden="true">{badge > 99 ? "99+" : badge}</span>}
    </button>
  );
}
