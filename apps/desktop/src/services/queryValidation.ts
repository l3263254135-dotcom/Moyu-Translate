export type QueryValidationReason = "empty" | "symbols" | "repeated" | "gibberish" | "too-long";

export interface QueryValidation {
  valid: boolean;
  normalized: string;
  reason?: QueryValidationReason;
}

const chinesePattern = /[\u3400-\u9fff]/u;
const letterOrNumberPattern = /[\p{L}\p{N}]/u;
const symbolsOnlyPattern = /^[^\p{L}\p{N}\u3400-\u9fff]+$/u;
const continuousTokenPattern = /^[A-Za-z0-9_'-]+$/u;
const lettersOnlyPattern = /^[A-Za-z]+$/u;
const vowelPattern = /[aeiou]/iu;

/**
 * Keep the query gate deliberately conservative: it only rejects inputs that
 * are clearly accidental, so acronyms, product names and game terminology
 * continue to reach the dictionary/model.
 */
export function validateQueryInput(text: string): QueryValidation {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (!normalized) return { valid: false, normalized, reason: "empty" };
  if (symbolsOnlyPattern.test(normalized) || !letterOrNumberPattern.test(normalized)) {
    return { valid: false, normalized, reason: "symbols" };
  }
  if (normalized.length >= 2 && /^(.)\1+$/su.test(normalized)) {
    return { valid: false, normalized, reason: "repeated" };
  }
  if (normalized.length > 80 && continuousTokenPattern.test(normalized)) {
    return { valid: false, normalized, reason: "too-long" };
  }
  // Only flag unusually long, letters-only consonant noise. Short acronyms
  // such as API/RAG and domain terms with digits/underscores remain allowed.
  if (
    !chinesePattern.test(normalized)
    && lettersOnlyPattern.test(normalized)
    && normalized.length >= 18
    && !vowelPattern.test(normalized)
  ) {
    return { valid: false, normalized, reason: "gibberish" };
  }
  return { valid: true, normalized };
}

export function queryValidationMessage(reason?: QueryValidationReason) {
  switch (reason) {
    case "empty": return "请输入有效单词或短句";
    case "symbols": return "请输入有效单词或短句（不能只有符号）";
    case "repeated": return "请输入有效单词或短句（检测到重复字符）";
    case "gibberish": return "请输入有效单词或短句（未识别到有效字母组合）";
    case "too-long": return "请输入有效单词或短句（连续文本不能超过 80 个字符）";
    default: return "请输入有效单词或短句";
  }
}
