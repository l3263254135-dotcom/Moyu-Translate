import { Button } from "@moyu/ui";
import { ArrowLeft, Clock3, Search, Star, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

export function LibraryView() {
  const kind = useAppStore((state) => state.libraryKind);
  const query = useAppStore((state) => state.libraryQuery);
  const entries = useAppStore((state) => state.savedTranslations);
  const working = useAppStore((state) => state.libraryWorking);
  const setOpen = useAppStore((state) => state.setLibraryOpen);
  const setKind = useAppStore((state) => state.setLibraryKind);
  const setQuery = useAppStore((state) => state.setLibraryQuery);
  const refresh = useAppStore((state) => state.refreshSavedTranslations);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const removeFavorite = useAppStore((state) => state.removeFavorite);
  const openSaved = useAppStore((state) => state.openSavedTranslation);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 180);
    return () => window.clearTimeout(timeout);
  }, [query, refresh]);

  return (
    <div className="library-view">
      <header className="library-view__header">
        <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => void setOpen(false)}>返回翻译</Button>
        <h2>收藏与历史</h2>
      </header>

      <div className="library-tabs" role="tablist" aria-label="本地记录类型">
        <button role="tab" aria-selected={kind === "favorite"} onClick={() => void setKind("favorite")}><Star size={14} />收藏</button>
        <button role="tab" aria-selected={kind === "history"} onClick={() => void setKind("history")}><Clock3 size={14} />历史</button>
      </div>

      <div className="library-search">
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "favorite" ? "搜索收藏" : "搜索历史"} aria-label="搜索本地记录" />
        {kind === "history" && entries.length > 0 && (
          <button type="button" title="清空历史" aria-label="清空历史" onClick={() => void clearHistory()}><Trash2 size={14} /></button>
        )}
      </div>

      <div className="library-list" aria-busy={working}>
        {!working && entries.length === 0 && (
          <div className="library-empty">
            {kind === "favorite" ? <Star size={22} /> : <Clock3 size={22} />}
            <p>{query ? "没有匹配的记录" : kind === "favorite" ? "还没有收藏" : "本地历史为空"}</p>
          </div>
        )}
        {entries.map((entry) => (
          <div className="library-row" key={`${entry.kind}-${entry.id}`}>
            <button className="library-row__open" type="button" onClick={() => void openSaved(entry)}>
              <span>{entry.result.headword ?? entry.result.sourceText}</span>
              <strong>{entry.result.primaryText}</strong>
              <time>{formatStoredAt(entry.storedAt)}</time>
            </button>
            {kind === "favorite" && (
              <button className="library-row__remove" type="button" title="取消收藏" aria-label={`取消收藏 ${entry.result.sourceText}`} onClick={() => void removeFavorite(entry.result)}>
                <Star size={14} fill="currentColor" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatStoredAt(value: string) {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/u.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
