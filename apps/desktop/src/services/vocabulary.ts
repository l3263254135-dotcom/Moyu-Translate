import type {
  ReviewRating,
  TranslationResult,
  VocabularyCandidate,
  VocabularyEntry,
} from "@moyu/contracts";
import nlp from "compromise";

export const REVIEW_BATCH_SIZE = 20;
export const MASTERED_REVIEW_STAGE = 5;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;

const chinesePattern = /[\u3400-\u9fff]/u;
const englishTermPattern = /^[A-Za-z]+(?:['-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['-][A-Za-z]+)*){0,7}$/u;
const nounCompoundEndings = [
  "analysis", "assessment", "management", "research", "method", "model", "system", "systems",
  "architecture", "design", "strategy", "planning", "process", "policy", "service", "services",
  "framework", "development", "operations", "requirements", "study", "review", "report", "guide",
  "tool", "tools",
] as const;

export function normalizeVocabularyTerm(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

export function isVocabularyTerm(value: string) {
  const normalized = normalizeVocabularyTerm(value);
  return isBasicVocabularyTerm(normalized) && !looksLikeCompleteSentence(normalized);
}

function isBasicVocabularyTerm(value: string) {
  return value.length > 0 && value.length <= 80 && englishTermPattern.test(value);
}

interface ParsedTerm {
  text: string;
  normal?: string;
  tags?: string[];
}

function looksLikeCompleteSentence(value: string) {
  const parsed = nlp(value).json({ terms: { text: true, normal: true, tags: true } }) as Array<{ terms?: ParsedTerm[] }>;
  const terms = parsed[0]?.terms ?? [];
  return terms.some((term, index) => {
    if (index === 0 || !term.tags?.includes("Verb")) return false;
    if ((terms[index - 1]?.normal ?? terms[index - 1]?.text.toLowerCase()) === "to") return false;
    const hasSubject = terms.slice(0, index).some((candidate) => candidate.tags?.includes("Noun"));
    return hasSubject && !isNounCompoundException(terms, index);
  });
}

function isNounCompoundException(terms: ParsedTerm[], verbIndex: number) {
  if (terms.length !== 3 || verbIndex !== 1) return false;
  const headword = terms[2]?.normal ?? terms[2]?.text.toLowerCase() ?? "";
  return terms[0]?.tags?.includes("Noun") === true
    && terms[2]?.tags?.includes("Noun") === true
    && nounCompoundEndings.some((ending) => headword.endsWith(ending));
}

export function vocabularyCandidateFromResult(result: TranslationResult): VocabularyCandidate | null {
  const sourceText = result.sourceText.trim();
  const translatingFromChinese = chinesePattern.test(sourceText);
  const preferredEnglish = translatingFromChinese
    ? result.primaryText
    : (result.headword && isVocabularyTerm(result.headword) ? result.headword : sourceText);
  const term = normalizeVocabularyTerm(preferredEnglish);
  if (!isVocabularyTerm(term)) return null;

  return {
    term,
    definition: translatingFromChinese ? sourceText : result.primaryText.trim(),
    originalSourceText: sourceText,
    result,
  };
}

export function vocabularyUnavailableReason(result: TranslationResult) {
  const sourceText = result.sourceText.trim();
  if (sourceText.length > 80 || result.primaryText.trim().length > 80) return "生词本仅支持 80 个字符以内的英文单词或短语";
  if (chinesePattern.test(sourceText)) return "当前英文结果不是可复习的单词或短语";
  return "生词本仅支持 1–8 个英文词组成的单词或短语，完整句子不会加入";
}

export function takeReviewBatch(entries: VocabularyEntry[], now = new Date(), limit = REVIEW_BATCH_SIZE) {
  const timestamp = now.getTime();
  return entries
    .filter((entry) => entry.reviewEligible && new Date(entry.nextReviewAt).getTime() <= timestamp)
    .sort((left, right) => {
      const due = new Date(left.nextReviewAt).getTime() - new Date(right.nextReviewAt).getTime();
      return due || new Date(left.addedAt).getTime() - new Date(right.addedAt).getTime();
    })
    .slice(0, limit);
}

export function nextReviewSchedule(reviewStage: number, rating: ReviewRating, reviewedAt = new Date()) {
  if (rating === "again") {
    return {
      reviewStage: 0,
      nextReviewAt: new Date(reviewedAt.getTime() + 10 * 60 * 1_000).toISOString(),
      lapseIncrement: 1,
    };
  }
  const nextStage = Math.min(Math.max(0, reviewStage) + 1, REVIEW_INTERVAL_DAYS.length);
  const days = REVIEW_INTERVAL_DAYS[nextStage - 1] ?? 60;
  return {
    reviewStage: nextStage,
    nextReviewAt: new Date(reviewedAt.getTime() + days * 24 * 60 * 60 * 1_000).toISOString(),
    lapseIncrement: 0,
  };
}

export function shouldRequeueReview(term: string, rating: ReviewRating, requeuedTerms: string[]) {
  const key = normalizeVocabularyTerm(term).toLowerCase();
  return rating === "again" && !requeuedTerms.includes(key);
}

export function dueReviewEntryAt(entries: VocabularyEntry[], index: number, now = new Date()) {
  const entry = entries[index];
  if (!entry || new Date(entry.nextReviewAt).getTime() > now.getTime()) return undefined;
  return entry;
}
