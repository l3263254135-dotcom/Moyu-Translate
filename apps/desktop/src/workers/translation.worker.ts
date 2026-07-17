import { env, pipeline } from "@huggingface/transformers";
import {
  modelTotalBytes,
  verifiedModelManifests,
  type VerifiedModelFile,
  type VerifiedModelManifest,
} from "../services/modelManifest";

type Direction = "en-zh" | "zh-en";

interface WorkerRequest {
  id: number;
  type: "load" | "translate" | "delete";
  direction: Direction;
  text?: string;
}

const cacheName = "moyu-verified-models-v1";
const partialDatabaseName = "moyu-model-partials-v1";
const officialHost = "https://huggingface.co";
const mirrorHost = "https://hf-mirror.com";
const translators = new Map<Direction, Promise<unknown>>();

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(request: RequestInfo | URL) {
    return (await caches.open(cacheName)).match(cacheKey(request));
  },
  async put(request: RequestInfo | URL, response: Response) {
    return (await caches.open(cacheName)).put(cacheKey(request), response);
  },
};

function cacheKey(request: RequestInfo | URL) {
  if (typeof request === "string") return request;
  if (request instanceof URL) return request.toString();
  return request.url;
}

function modelUrl(manifest: VerifiedModelManifest, file: VerifiedModelFile, host = officialHost) {
  return `${host}/${manifest.repository}/resolve/${manifest.revision}/${file.path}`;
}

async function ensureModel(direction: Direction, requestId: number) {
  const manifest = verifiedModelManifests[direction];
  const cache = await caches.open(cacheName);
  const total = modelTotalBytes(direction);
  let completed = 0;
  for (const file of manifest.files) {
    const key = modelUrl(manifest, file);
    if (await cache.match(key)) {
      completed += file.bytes;
      postProgress(requestId, direction, completed, total, file.path);
      continue;
    }
    await downloadVerifiedFile(manifest, file, (loaded) => {
      postProgress(requestId, direction, completed + loaded, total, file.path);
    });
    completed += file.bytes;
  }
}

function postProgress(id: number, direction: Direction, loaded: number, total: number, file: string) {
  self.postMessage({
    id,
    type: "progress",
    direction,
    progress: { status: "progress", file, loaded, total, progress: total > 0 ? loaded / total * 100 : 0 },
  });
}

async function downloadVerifiedFile(
  manifest: VerifiedModelManifest,
  file: VerifiedModelFile,
  onProgress: (loaded: number) => void,
) {
  const key = modelUrl(manifest, file);
  let partial = await readPartial(key) ?? new Blob();
  if (partial.size > file.bytes) {
    partial = new Blob();
    await deletePartial(key);
  }

  let response = await fetchModel(manifest, file, partial.size);
  if (partial.size > 0 && response.status !== 206) {
    partial = new Blob();
    await deletePartial(key);
    response = await fetchModel(manifest, file, 0);
  }
  if (!response.ok || !response.body) throw new Error(`语言包下载失败：${file.path} (HTTP ${response.status})`);

  const reader = response.body.getReader();
  let buffered: ArrayBuffer[] = [];
  let bufferedBytes = 0;
  let loaded = partial.size;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      buffered.push(chunk.buffer);
      bufferedBytes += value.byteLength;
      loaded += value.byteLength;
      onProgress(Math.min(loaded, file.bytes));
      if (bufferedBytes >= 4 * 1024 * 1024) {
        partial = new Blob([partial, ...buffered]);
        buffered = [];
        bufferedBytes = 0;
        await writePartial(key, partial);
      }
    }
  } catch (error) {
    if (buffered.length > 0) await writePartial(key, new Blob([partial, ...buffered]));
    throw error;
  }

  const complete = new Blob([partial, ...buffered]);
  if (complete.size !== file.bytes) {
    await writePartial(key, complete);
    throw new Error(`语言包大小不匹配：${file.path}`);
  }
  const digest = await sha256(complete);
  if (digest !== file.sha256) {
    await deletePartial(key);
    throw new Error(`语言包 SHA-256 校验失败：${file.path}`);
  }
  await (await caches.open(cacheName)).put(key, new Response(complete, {
    headers: { "content-type": file.path.endsWith(".json") ? "application/json" : "application/octet-stream" },
  }));
  await deletePartial(key);
}

async function fetchModel(manifest: VerifiedModelManifest, file: VerifiedModelFile, offset: number) {
  const headers = offset > 0 ? { Range: `bytes=${offset}-` } : undefined;
  let lastError: unknown;
  for (const host of [officialHost, mirrorHost]) {
    try {
      const response = await fetch(modelUrl(manifest, file, host), { headers });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`无法下载语言包文件 ${file.path}：${String(lastError)}`);
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openPartialDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(partialDatabaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readPartial(key: string) {
  const database = await openPartialDatabase();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction("files", "readonly").objectStore("files").get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

async function writePartial(key: string, blob: Blob) {
  const database = await openPartialDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction("files", "readwrite").objectStore("files").put(blob, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

async function deletePartial(key: string) {
  const database = await openPartialDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction("files", "readwrite").objectStore("files").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

function getTranslator(direction: Direction, requestId: number) {
  let translator = translators.get(direction);
  if (!translator) {
    const manifest = verifiedModelManifests[direction];
    translator = ensureModel(direction, requestId).then(() => pipeline("translation", manifest.repository, {
      dtype: "q8",
      revision: manifest.revision,
    }));
    translators.set(direction, translator);
  }
  return translator;
}

async function deleteModel(direction: Direction) {
  const translator = translators.get(direction);
  if (translator) {
    const loaded = await translator as { dispose?: () => Promise<unknown> };
    await loaded.dispose?.();
    translators.delete(direction);
  }
  const manifest = verifiedModelManifests[direction];
  const cache = await caches.open(cacheName);
  for (const file of manifest.files) {
    const key = modelUrl(manifest, file);
    await cache.delete(key);
    await deletePartial(key);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "delete") {
      await deleteModel(request.direction);
      self.postMessage({ id: request.id, type: "deleted", direction: request.direction });
      return;
    }
    const translator = await getTranslator(request.direction, request.id) as (
      text: string,
      options?: Record<string, unknown>,
    ) => Promise<Array<{ translation_text: string }>>;
    if (request.type === "load") {
      self.postMessage({ id: request.id, type: "ready", direction: request.direction });
      return;
    }
    const output = await translator(request.text ?? "", { max_new_tokens: 256 });
    self.postMessage({
      id: request.id,
      type: "result",
      direction: request.direction,
      translation: output[0]?.translation_text?.trim() ?? "",
    });
  } catch (error) {
    translators.delete(request.direction);
    self.postMessage({
      id: request.id,
      type: "error",
      direction: request.direction,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
