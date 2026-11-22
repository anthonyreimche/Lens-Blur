// Lens Blur, a Safelight extension (GPL-3.0-or-later).
// Where the depth model is kept once downloaded: the app's IndexedDB. (Each
// photo's depth is kept with the photo, in the project: photo-data.ts.)

export interface ModelStore {
  /** Whether bytes are kept under `sha256`, without reading them. */
  hasModel(sha256: string): Promise<boolean>;
  getModel(sha256: string): Promise<ArrayBuffer | null>;
  putModel(sha256: string, bytes: ArrayBuffer): Promise<void>;
  deleteModel(sha256: string): Promise<void>;
}

const DB = "lens-blur";
const MODELS = "models";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

/** The store in the app's IndexedDB, opened on first use. */
export function indexedDbStore(): ModelStore {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(MODELS);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        opened = null;
        reject(r.error ?? new Error("IndexedDB wouldn't open"));
      };
    }));
  const store = async (mode: IDBTransactionMode) => (await db()).transaction(MODELS, mode).objectStore(MODELS);
  return {
    hasModel: async (sha) => (await request((await store("readonly")).count(sha))) > 0,
    getModel: async (sha) => {
      const v: unknown = await request((await store("readonly")).get(sha));
      return v instanceof ArrayBuffer ? v : null;
    },
    putModel: async (sha, bytes) => void (await request((await store("readwrite")).put(bytes, sha))),
    deleteModel: async (sha) => void (await request((await store("readwrite")).delete(sha))),
  };
}
