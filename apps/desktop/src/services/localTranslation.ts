import type {
  ModelPackStatus,
  SupportedLanguage,
  TranslationRequest,
  TranslationResult,
} from "@moyu/contracts";
import { modelTotalBytes } from "./modelManifest";

export type ModelDirection = "en-zh" | "zh-en";

interface WorkerResponse {
  id: number;
  type: "progress" | "ready" | "result" | "deleted" | "error";
  direction: ModelDirection;
  translation?: string;
  error?: string;
  progress?: {
    status: string;
    file?: string;
    loaded?: number;
    total?: number;
    progress?: number;
  };
}

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  onProgress?: (status: ModelPackStatus) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

const modelIds: Record<ModelDirection, string> = {
  "en-zh": "moyu-en-zh-q8-v1",
  "zh-en": "moyu-zh-en-q8-v1",
};

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, PendingRequest>();

function readyKey(direction: ModelDirection) {
  return `moyu-model-ready:${modelIds[direction]}`;
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/translation.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    if (response.type === "progress") {
      const progress = response.progress;
      request.onProgress?.({
        id: modelIds[response.direction],
        state: "downloading",
        downloadedBytes: progress?.loaded ?? 0,
        totalBytes: progress?.total ?? 0,
      });
      return;
    }
    request.signal?.removeEventListener("abort", request.onAbort ?? (() => undefined));
    pending.delete(response.id);
    if (response.type === "error") {
      localStorage.removeItem(readyKey(response.direction));
      request.reject(new Error(`本地语言包加载失败：${response.error ?? "未知错误"}`));
      return;
    }
    if (response.type === "deleted") localStorage.removeItem(readyKey(response.direction));
    else localStorage.setItem(readyKey(response.direction), "true");
    request.resolve(response.translation ?? "");
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(`本地翻译进程异常：${event.message}`);
    resetWorker(error);
  });
  return worker;
}

function abortError() {
  const error = new Error("查询已取消");
  error.name = "AbortError";
  return error;
}

/** Terminate a worker that cannot safely cancel an in-flight model call. */
function resetWorker(reason: Error) {
  for (const request of pending.values()) {
    request.signal?.removeEventListener("abort", request.onAbort ?? (() => undefined));
    request.reject(reason);
  }
  pending.clear();
  worker?.terminate();
  worker = null;
}

function runWorker(
  type: "load" | "translate" | "delete",
  direction: ModelDirection,
  text?: string,
  onProgress?: (status: ModelPackStatus) => void,
  signal?: AbortSignal,
) {
  return new Promise<string>((resolve, reject) => {
    const id = ++sequence;
    const request: PendingRequest = { resolve, reject, onProgress, signal };
    const onAbort = () => {
      if (!pending.has(id)) return;
      pending.delete(id);
      request.signal?.removeEventListener("abort", onAbort);
      // Transformers.js does not expose a reliable per-request cancellation;
      // rebuilding the worker ensures the next query is immediately usable.
      resetWorker(abortError());
      reject(abortError());
    };
    request.onAbort = onAbort;
    pending.set(id, request);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      getWorker().postMessage({ id, type, direction, text });
    } catch (error) {
      pending.delete(id);
      signal?.removeEventListener("abort", onAbort);
      resetWorker(error instanceof Error ? error : new Error(String(error)));
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function directionFor(sourceLanguage: SupportedLanguage): ModelDirection {
  return sourceLanguage === "en" ? "en-zh" : "zh-en";
}

export function localModelStatuses(): ModelPackStatus[] {
  return (Object.keys(modelIds) as ModelDirection[]).map((direction) => ({
    id: modelIds[direction],
    state: localStorage.getItem(readyKey(direction)) === "true" ? "ready" : "missing",
    downloadedBytes: localStorage.getItem(readyKey(direction)) === "true" ? modelTotalBytes(direction) : 0,
    totalBytes: modelTotalBytes(direction),
  }));
}

export async function prepareLocalModel(
  direction: ModelDirection,
  onProgress?: (status: ModelPackStatus) => void,
) {
  await runWorker("load", direction, undefined, onProgress);
  const totalBytes = modelTotalBytes(direction);
  return { id: modelIds[direction], state: "ready", downloadedBytes: totalBytes, totalBytes } satisfies ModelPackStatus;
}

export async function removeLocalModel(direction: ModelDirection) {
  await runWorker("delete", direction);
  localStorage.removeItem(readyKey(direction));
  return { id: modelIds[direction], state: "missing", downloadedBytes: 0, totalBytes: modelTotalBytes(direction) } satisfies ModelPackStatus;
}

export async function translateWithLocalModel(
  request: TranslationRequest,
  onProgress?: (status: ModelPackStatus) => void,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  const started = performance.now();
  const direction = directionFor(request.sourceLanguage);
  const primaryText = await runWorker("translate", direction, request.text, onProgress, signal);
  return {
    sourceText: request.text,
    primaryText,
    pronunciations: [],
    senses: [],
    forms: [],
    examples: [],
    relations: [],
    vocabularyTags: [],
    sources: [{ id: modelIds[direction], title: "Moyu q8", detail: "本地离线语言包" }],
    provider: "Moyu 本地模型",
    latencyMilliseconds: Math.round(performance.now() - started),
  };
}
