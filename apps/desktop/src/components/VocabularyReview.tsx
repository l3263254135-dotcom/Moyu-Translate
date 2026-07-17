import { Button, Badge } from "@moyu/ui";
import { ArrowLeft, Check, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { speak } from "../services/bridge";
import { dueReviewEntryAt, MASTERED_REVIEW_STAGE } from "../services/vocabulary";
import { useAppStore } from "../store/useAppStore";

export function VocabularyReview() {
  const queue = useAppStore((state) => state.reviewQueue);
  const index = useAppStore((state) => state.reviewIndex);
  const initialCount = useAppStore((state) => state.reviewInitialCount);
  const completedCount = useAppStore((state) => state.reviewCompletedCount);
  const revealed = useAppStore((state) => state.reviewRevealed);
  const working = useAppStore((state) => state.reviewWorking);
  const stopReview = useAppStore((state) => state.stopReview);
  const setRevealed = useAppStore((state) => state.setReviewRevealed);
  const grade = useAppStore((state) => state.gradeReview);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const pending = queue[index];
  const current = dueReviewEntryAt(queue, index, new Date(currentTime));
  const completed = !current;
  const currentPosition = completedCount + (current ? 1 : 0);
  const reviewTotal = Math.max(initialCount, currentPosition);

  useEffect(() => {
    if (!pending) return;
    const delay = new Date(pending.nextReviewAt).getTime() - Date.now();
    if (delay <= 0) {
      setCurrentTime(Date.now());
      return;
    }
    const timeout = window.setTimeout(() => setCurrentTime(Date.now()), delay + 25);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!current || working) return;
      if (event.code === "Space" && !revealed) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && event.key === "1") {
        void grade("again");
      } else if (revealed && event.key === "2") {
        void grade("known");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, grade, revealed, setRevealed, working]);

  return (
    <div className="review-view">
      <header className="review-view__header">
        <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => void stopReview()}>结束复习</Button>
        <h2>卡片复习</h2>
        <span>{currentPosition}/{reviewTotal}</span>
      </header>

      {completed ? (
        <div className="review-complete">
          <div className="review-complete__mark"><Check size={26} /></div>
          <h3>{initialCount === 0 ? "今天没有待复习的词" : "本轮复习完成"}</h3>
          <p>{initialCount === 0 ? "新加入的生词会按计划出现在这里。" : `已处理 ${completedCount} 张卡片，复习进度已保存在本机。`}</p>
          <Button onClick={() => void stopReview()}>返回生词本</Button>
        </div>
      ) : (
        <>
          <div className="review-progress" aria-label={`复习进度 ${currentPosition}/${reviewTotal}`}><span style={{ width: `${(currentPosition / reviewTotal) * 100}%` }} /></div>
          <article className={`review-card ${revealed ? "is-revealed" : ""}`}>
            <div className="review-card__meta">
              <Badge>{current.reviewStage >= MASTERED_REVIEW_STAGE ? "巩固" : current.reviewStage === 0 ? "新词" : `阶段 ${current.reviewStage}`}</Badge>
              <span>已复习 {current.reviewCount} 次</span>
            </div>
            <div className="review-card__term">
              <h3>{current.term}</h3>
              <button type="button" className="icon-action" aria-label={`朗读 ${current.term}`} onClick={() => speak(current.term)}><Volume2 size={16} /></button>
              {current.result.pronunciations[0] && <span>/{current.result.pronunciations[0].ipa}/</span>}
            </div>
            {!revealed ? (
              <Button onClick={() => setRevealed(true)}>显示释义</Button>
            ) : (
              <div className="review-card__answer">
                <div className="review-card__definition">
                  {current.result.senses[0]?.partOfSpeech && <span>{current.result.senses[0].partOfSpeech}</span>}
                  <p>{current.definition}</p>
                </div>
                {current.result.examples[0] && (
                  <figure>
                    <blockquote>{current.result.examples[0].english}</blockquote>
                    {current.result.examples[0].chinese && <figcaption>{current.result.examples[0].chinese}</figcaption>}
                  </figure>
                )}
              </div>
            )}
          </article>
          {revealed && (
            <div className="review-actions">
              <Button variant="quiet" icon={<RotateCcw size={16} />} disabled={working} onClick={() => void grade("again")}>不认识</Button>
              <Button icon={<Check size={16} />} disabled={working} onClick={() => void grade("known")}>认识</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
