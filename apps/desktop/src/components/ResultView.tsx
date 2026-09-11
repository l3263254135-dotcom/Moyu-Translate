import { Badge, Disclosure } from "@moyu/ui";
import type { Pronunciation } from "@moyu/contracts";
import { Copy, Star, Volume2 } from "lucide-react";
import { useState } from "react";
import { speak } from "../services/bridge";
import { vocabularyUnavailableReason } from "../services/vocabulary";
import { useAppStore } from "../store/useAppStore";

export function ResultView() {
  const result = useAppStore((state) => state.result);
  const inVocabulary = useAppStore((state) => state.inVocabulary);
  const vocabularyCandidate = useAppStore((state) => state.vocabularyCandidate);
  const vocabularyMessage = useAppStore((state) => state.vocabularyMessage);
  const toggleVocabulary = useAppStore((state) => state.toggleVocabulary);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (!result) return null;

  const primarySense = result.senses[0];
  const additionalSenses = result.senses.slice(1);
  const pronunciationText = result.headword ?? result.sourceText;
  const pronunciationItems = preferredPronunciations(result.pronunciations);
  const setSection = (section: string) => setOpen((value) => ({ ...value, [section]: !value[section] }));

  return (
    <div className="result" aria-live="polite">
      <div className="result__head">
        <div>
          <div className="result__word-row">
            <h2>{result.headword ?? result.sourceText}</h2>
            <button className="icon-action icon-action--primary" type="button" onClick={() => void speak(pronunciationText, "en-US").catch(() => undefined)} aria-label="美音朗读单词">
              <Volume2 size={15} />
            </button>
          </div>
          {pronunciationItems.length > 0 && (
            <div className="pronunciations">
              {pronunciationItems.map((item) => <PronunciationPill key={`${item.locale}-${item.ipa}`} item={item} text={pronunciationText} />)}
            </div>
          )}
        </div>
        <div className="result__actions">
          <button className="icon-action" type="button" onClick={() => navigator.clipboard.writeText(result.primaryText)} aria-label="复制主释义">
            <Copy size={15} />
          </button>
          <button
            className={`icon-action ${inVocabulary ? "is-active" : ""}`}
            type="button"
            onClick={toggleVocabulary}
            aria-label={inVocabulary ? "从生词本移除" : "加入生词本"}
            title={vocabularyCandidate ? (inVocabulary ? "从生词本移除" : "加入生词本") : vocabularyUnavailableReason(result)}
            disabled={!vocabularyCandidate}
          >
            <Star size={15} fill={inVocabulary ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="primary-sense">
        {primarySense && <span className="part-of-speech">{primarySense.partOfSpeech}</span>}
        <p>{primarySense?.meanings[0] ?? result.primaryText}</p>
      </div>

      {result.vocabularyTags.length > 0 && (
        <div className="tag-strip">
          {result.vocabularyTags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
      )}

      {additionalSenses.length > 0 && (
        <Disclosure title="更多释义" detail={additionalSenses.length} open={Boolean(open.senses)} onToggle={() => setSection("senses")}>
          <div className="sense-list">
            {additionalSenses.map((sense) => (
              <div className="sense-row" key={sense.id}>
                <span>{sense.partOfSpeech}</span>
                <p>{sense.meanings.join("；")}</p>
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      {result.forms.length > 0 && (
        <Disclosure title="词形变化" detail={result.forms.length} open={Boolean(open.forms)} onToggle={() => setSection("forms")}>
          <dl className="form-list">
            {result.forms.map((form) => <div key={`${form.label}-${form.value}`}><dt>{form.label}</dt><dd>{form.value}</dd></div>)}
          </dl>
        </Disclosure>
      )}

      {result.examples.length > 0 && (
        <Disclosure title="例句" detail={result.examples.length} open={Boolean(open.examples)} onToggle={() => setSection("examples")}>
          <div className="example-list">
            {result.examples.map((example) => (
              <figure key={example.id}>
                <blockquote>{example.english}</blockquote>
                {example.chinese && <figcaption>{example.chinese}</figcaption>}
              </figure>
            ))}
          </div>
        </Disclosure>
      )}

      {result.relations.length > 0 && (
        <Disclosure title="同反义词" detail={result.relations.length} open={Boolean(open.relations)} onToggle={() => setSection("relations")}>
          <div className="relation-list">
            {result.relations.map((relation) => (
              <div key={relation.type}>
                <span>{relation.type === "synonym" ? "同义" : "反义"}</span>
                <p>{relation.words.join(" · ")}</p>
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      {result.sources.length > 0 && (
        <Disclosure title="更多来源" detail={result.sources.length} open={Boolean(open.sources)} onToggle={() => setSection("sources")}>
          <div className="source-list">
            {result.sources.map((source) => (
              <div key={source.id}>
                <strong>{source.title}</strong>
                {source.detail && <span>{source.detail}</span>}
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      <footer className="result__footer">
        <span>{vocabularyMessage ?? result.provider}</span>
        <span>{result.latencyMilliseconds}ms</span>
      </footer>
    </div>
  );
}

function preferredPronunciations(pronunciations: Pronunciation[]) {
  const byLocale = new Map<Pronunciation["locale"], Pronunciation>();
  pronunciations.forEach((item) => {
    if (!byLocale.has(item.locale)) byLocale.set(item.locale, item);
  });
  return (["en-GB", "en-US", "general"] as const)
    .map((locale) => byLocale.get(locale))
    .filter((item): item is Pronunciation => Boolean(item));
}

function PronunciationPill({ item, text }: { item: Pronunciation; text: string }) {
  const label = item.locale === "en-GB" ? "UK" : item.locale === "en-US" ? "US" : "IPA";
  const locale = item.locale === "en-GB" ? "en-GB" : "en-US";
  const ariaLabel = item.locale === "en-GB" ? "英音朗读" : item.locale === "en-US" ? "美音朗读" : "默认朗读";
  return (
    <span className="pronunciation-pill">
      <strong>{label}</strong>
      <span>/{item.ipa}/</span>
      <button type="button" onClick={() => void speak(text, locale).catch(() => undefined)} aria-label={ariaLabel}>
        <Volume2 size={12} />
      </button>
    </span>
  );
}
