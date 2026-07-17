import { Button } from "@moyu/ui";
import { ArrowLeft, BookMarked, Check, Clock3, Play, Search, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { MASTERED_REVIEW_STAGE, REVIEW_BATCH_SIZE } from "../services/vocabulary";
import { useAppStore } from "../store/useAppStore";
import { VocabularyReview } from "./VocabularyReview";

export function LibraryView() {
  const kind = useAppStore((state) => state.libraryKind);
  const query = useAppStore((state) => state.libraryQuery);
  const vocabularyEntries = useAppStore((state) => state.vocabularyEntries);
  const historyEntries = useAppStore((state) => state.savedTranslations);
  const stats = useAppStore((state) => state.vocabularyStats);
  const filter = useAppStore((state) => state.vocabularyFilter);
  const working = useAppStore((state) => state.libraryWorking);
  const reviewWorking = useAppStore((state) => state.reviewWorking);
  const reviewOpen = useAppStore((state) => state.reviewOpen);
  const setOpen = useAppStore((state) => state.setLibraryOpen);
  const setKind = useAppStore((state) => state.setLibraryKind);
  const setQuery = useAppStore((state) => state.setLibraryQuery);
  const setFilter = useAppStore((state) => state.setVocabularyFilter);
  const refresh = useAppStore((state) => state.refreshLibrary);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const removeVocabulary = useAppStore((state) => state.removeVocabularyEntry);
  const openVocabulary = useAppStore((state) => state.openVocabularyEntry);
  const openSaved = useAppStore((state) => state.openSavedTranslation);
  const startReview = useAppStore((state) => state.startReview);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 180);
    return () => window.clearTimeout(timeout);
  }, [query, refresh]);

  if (reviewOpen) return <VocabularyReview />;

  return (
    <div className="library-view">
      <header className="library-view__header">
        <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => void setOpen(false)}>返回翻译</Button>
        <h2>生词本与历史</h2>
      </header>

      <div className="library-tabs" role="tablist" aria-label="本地学习内容">
        <button role="tab" aria-selected={kind === "favorite"} onClick={() => void setKind("favorite")}><BookMarked size={14} />生词本</button>
        <button role="tab" aria-selected={kind === "history"} onClick={() => void setKind("history")}><Clock3 size={14} />历史</button>
      </div>

      {kind === "favorite" && (
        <>
          <section className="vocabulary-summary" aria-label="生词本概况">
            <div><strong>{stats.total}</strong><span>全部</span></div>
            <div><strong>{stats.dueToday}</strong><span>待复习</span></div>
            <div><strong>{stats.mastered}</strong><span>已掌握</span></div>
            <Button
              icon={stats.dueToday > 0 ? <Play size={15} /> : <Check size={15} />}
              disabled={working || reviewWorking}
              onClick={() => void startReview()}
            >{stats.dueToday > 0 ? `开始复习 ${Math.min(stats.dueToday, REVIEW_BATCH_SIZE)}` : "今日已完成"}</Button>
          </section>
          {stats.legacy > 0 && <p className="vocabulary-legacy-note">{stats.legacy} 条旧收藏仅供浏览，不进入复习队列。</p>}
          <div className="vocabulary-filters" role="tablist" aria-label="生词筛选">
            {(["all", "due", "mastered"] as const).map((value) => (
              <button key={value} role="tab" aria-selected={filter === value} onClick={() => void setFilter(value)}>
                {value === "all" ? "全部" : value === "due" ? "待复习" : "已掌握"}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="library-search">
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "favorite" ? "搜索单词或释义" : "搜索历史"} aria-label="搜索本地记录" />
        {kind === "history" && historyEntries.length > 0 && (
          <button type="button" title="清空历史" aria-label="清空历史" onClick={() => void clearHistory()}><Trash2 size={14} /></button>
        )}
      </div>

      <div className="library-list" aria-busy={working}>
        {kind === "favorite" ? (
          <>
            {!working && vocabularyEntries.length === 0 && (
              <div className="library-empty"><BookMarked size={22} /><p>{emptyVocabularyText(query, filter)}</p></div>
            )}
            {vocabularyEntries.map((entry) => {
              const due = entry.reviewEligible && new Date(entry.nextReviewAt).getTime() <= Date.now();
              const status = !entry.reviewEligible ? "旧收藏" : entry.reviewStage >= MASTERED_REVIEW_STAGE ? "已掌握" : due ? "待复习" : formatNextReview(entry.nextReviewAt);
              return (
                <div className="library-row vocabulary-row" key={entry.id}>
                  <button className="library-row__open" type="button" onClick={() => void openVocabulary(entry)}>
                    <span>{entry.term}</span>
                    <time data-due={due || undefined}>{status}</time>
                    <strong>{entry.definition}</strong>
                  </button>
                  <button className="library-row__remove" type="button" title="移出生词本" aria-label={`移出生词本 ${entry.term}`} onClick={() => void removeVocabulary(entry)}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {!working && historyEntries.length === 0 && (
              <div className="library-empty"><Clock3 size={22} /><p>{query ? "没有匹配的记录" : "本地历史为空"}</p></div>
            )}
            {historyEntries.map((entry) => (
              <div className="library-row" key={`${entry.kind}-${entry.id}`}>
                <button className="library-row__open" type="button" onClick={() => void openSaved(entry)}>
                  <span>{entry.result.headword ?? entry.result.sourceText}</span>
                  <strong>{entry.result.primaryText}</strong>
                  <time>{formatStoredAt(entry.storedAt)}</time>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function emptyVocabularyText(query: string, filter: "all" | "due" | "mastered") {
  if (query) return "没有匹配的生词";
  if (filter === "due") return "当前没有待复习的词";
  if (filter === "mastered") return "继续复习，掌握的词会出现在这里";
  return "查词后点击星标，把单词加入生词本";
}

function formatStoredAt(value: string) {
  const date = parseStoredDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatNextReview(value: string) {
  const date = parseStoredDate(value);
  if (!date) return "稍后复习";
  return `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date)}复习`;
}

function parseStoredDate(value: string) {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/u.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
