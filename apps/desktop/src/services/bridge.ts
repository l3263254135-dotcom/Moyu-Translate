import type {
  AppPreferences,
  ModelPackStatus,
  PlatformCapabilities,
  SavedTranslation,
  SavedTranslationKind,
  TranslationRequest,
  TranslationResult,
} from "@moyu/contracts";
import {
  localModelStatuses,
  prepareLocalModel,
  removeLocalModel,
  translateWithLocalModel,
  type ModelDirection,
} from "./localTranslation";

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

const previewResult: TranslationResult = {
  sourceText: "ability",
  headword: "ability",
  primaryText: "能力；才能",
  pronunciations: [
    { locale: "general", ipa: "əˈbɪləti", source: "ECDICT" },
    { locale: "en-US", ipa: "əˈbɪləti", source: "CMUdict" },
  ],
  senses: [
    {
      id: "ability-n-1",
      partOfSpeech: "n.",
      meanings: ["能力；才能", "做成某事所需要的本领或素质"],
      frequencyRank: 783,
      source: "ECDICT",
    },
    {
      id: "ability-n-2",
      partOfSpeech: "n.",
      meanings: ["技能；才智"],
      source: "WordNet",
    },
  ],
  forms: [{ label: "复数", value: "abilities" }],
  examples: [
    {
      id: "ability-example-1",
      english: "She has the ability to explain difficult ideas clearly.",
      chinese: "她有能力把复杂的想法解释清楚。",
      chineseProvider: "local-model",
      source: "WordNet · 本地翻译",
    },
  ],
  relations: [
    { type: "synonym", words: ["capability", "capacity", "talent"], source: "WordNet" },
    { type: "antonym", words: ["inability"], source: "WordNet" },
  ],
  vocabularyTags: ["Oxford 3000", "IELTS", "TOEFL", "CET-4", "考研"],
  sources: [
    { id: "ecdict", title: "ECDICT", detail: "开放英汉词典" },
    { id: "wordnet", title: "WordNet", detail: "词义关系与例句" },
  ],
  provider: "Moyu 离线词典",
  latencyMilliseconds: 38,
};

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function platformCapabilities(): Promise<PlatformCapabilities> {
  if (isTauriRuntime()) return invokeCommand("platform_capabilities");
  const windows = navigator.userAgent.includes("Windows");
  return {
    platform: windows ? "windows" : "web",
    triggerKeyLabel: windows ? "Alt" : "Option",
    accessibility: "not-determined",
    screenCapture: "not-determined",
    textToSpeech: true,
    platformDictionary: !windows,
    launchAtLogin: true,
  };
}

export async function translate(
  request: TranslationRequest,
  onModelProgress?: (status: ModelPackStatus) => void,
): Promise<TranslationResult> {
  if (isTauriRuntime()) {
    try {
      return await invokeCommand("translate", { request });
    } catch (error) {
      if (!String(error).includes("MODEL_REQUIRED")) throw error;
      const result = await translateWithLocalModel(request, onModelProgress);
      await invokeCommand("record_translation_result", { result });
      return result;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 90));
  const result = request.text.trim().toLowerCase() === "ability"
    ? previewResult
    : { ...previewResult, sourceText: request.text, headword: request.text, primaryText: `“${request.text}”的本地翻译预览` };
  recordPreviewHistory(result);
  return result;
}

export async function captureAtCursor(): Promise<string> {
  if (isTauriRuntime()) return invokeCommand("capture_text_at_cursor");
  return "ability";
}

export async function speak(text: string, locale = "en-US"): Promise<void> {
  if (isTauriRuntime()) return invokeCommand("speak", { text, locale });
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  speechSynthesis.speak(utterance);
}

export async function setPinned(pinned: boolean): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("set_panel_pinned", { pinned });
}

export async function savePreferences(preferences: AppPreferences): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("save_preferences", { preferences });
  else localStorage.setItem("moyu-preferences", JSON.stringify(preferences));
}

export async function setLaunchAtLogin(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const autostart = await import("@tauri-apps/plugin-autostart");
  if (enabled) await autostart.enable();
  else await autostart.disable();
}

export async function launchAtLoginEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function loadPreferences(): Promise<AppPreferences | null> {
  if (isTauriRuntime()) return invokeCommand("load_preferences");
  const stored = localStorage.getItem("moyu-preferences");
  return stored ? (JSON.parse(stored) as AppPreferences) : null;
}

export async function toggleFavorite(result: TranslationResult, favorite: boolean): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("toggle_favorite", { result, favorite });
  else {
    const entries = previewSaved("favorite").filter((item) => item.result.sourceText !== result.sourceText);
    if (favorite) entries.unshift(savedPreview("favorite", result));
    localStorage.setItem("moyu-preview-favorites", JSON.stringify(entries));
  }
}

export async function favoriteState(sourceText: string): Promise<boolean> {
  if (isTauriRuntime()) return invokeCommand("is_favorite", { sourceText });
  return previewSaved("favorite").some((item) => item.result.sourceText === sourceText);
}

export async function listSavedTranslations(
  kind: SavedTranslationKind,
  query = "",
  limit = 100,
): Promise<SavedTranslation[]> {
  if (isTauriRuntime()) return invokeCommand("list_saved_translations", { kind, query, limit });
  const normalized = query.trim().toLocaleLowerCase();
  return previewSaved(kind)
    .filter((item) => !normalized || item.result.sourceText.toLocaleLowerCase().includes(normalized))
    .slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  if (isTauriRuntime()) await invokeCommand("clear_history");
  else localStorage.removeItem("moyu-preview-history");
}

export async function modelStatus(): Promise<ModelPackStatus[]> {
  return localModelStatuses();
}

export async function prepareModel(
  direction: ModelDirection,
  onProgress?: (status: ModelPackStatus) => void,
): Promise<ModelPackStatus> {
  return prepareLocalModel(direction, onProgress);
}

export async function removeModel(direction: ModelDirection): Promise<ModelPackStatus> {
  return removeLocalModel(direction);
}

export async function hidePanel(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

function savedPreview(kind: SavedTranslationKind, result: TranslationResult): SavedTranslation {
  return {
    id: kind === "favorite" ? result.sourceText : `${Date.now()}`,
    kind,
    storedAt: new Date().toISOString(),
    result,
  };
}

function previewSaved(kind: SavedTranslationKind): SavedTranslation[] {
  const key = kind === "favorite" ? "moyu-preview-favorites" : "moyu-preview-history";
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as SavedTranslation[];
  } catch {
    return [];
  }
}

function recordPreviewHistory(result: TranslationResult) {
  const preferences = localStorage.getItem("moyu-preferences");
  if (!preferences || !(JSON.parse(preferences) as AppPreferences).historyEnabled) return;
  const history = [savedPreview("history", result), ...previewSaved("history")].slice(0, 500);
  localStorage.setItem("moyu-preview-history", JSON.stringify(history));
}

export { isTauriRuntime };
