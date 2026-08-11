import type { TranslationResult } from "@moyu/contracts";
import { isVocabularyTerm } from "./vocabulary";

const chinesePattern = /[\u3400-\u9fff]/u;

export function automaticPronunciationText(result: TranslationResult): string | null {
  const sourceText = result.sourceText.trim();
  if (chinesePattern.test(sourceText) || !isVocabularyTerm(sourceText)) return null;

  const headword = result.headword?.trim();
  return headword && isVocabularyTerm(headword) ? headword : sourceText;
}
