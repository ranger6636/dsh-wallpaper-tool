/**
 * Persistence. The wallpaper document (settings + library metadata) and the
 * uploaded image/video blobs both live in IndexedDB in the page's own origin,
 * so nothing is written to the machine, nothing crosses the network, and a
 * refresh or an app restart keeps the wallpaper.
 *
 * When IndexedDB is unavailable (private windows, hardened profiles) the module
 * degrades to an in-memory store: the plugin keeps working for the session and
 * reports that persistence is off instead of throwing.
 */
import { ASSET_STORE, DB_NAME, DB_VERSION, DEFAULTS_KEY, STATE_KEY, STATE_STORE } from './types.js';
import type { StudioSettings } from './types.js';
import { normaliseSettings } from './settings.js';

let dbPromise: Promise<IDBDatabase | null> | null = null;
let memoryState: StudioSettings | null = null;
const memoryAssets = new Map<string, Blob>();
let persistent = true;

export function isPersistent(): boolean {
  return persistent;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        persistent = false;
        resolve(null);
        return;
      }
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      persistent = false;
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      persistent = false;
      resolve(null);
    };
    request.onblocked = () => {
      persistent = false;
      resolve(null);
    };
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let request: IDBRequest<T>;
      // `transaction` must outlive the try block: the abort handler below needs
      // it. Declaring it inside the try made every call throw
      // "ReferenceError: transaction is not defined" — which took down settings
      // loading, settings saving and every upload at once.
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(store, mode);
        request = run(transaction.objectStore(store));
      } catch {
        persistent = false;
        resolve(null);
        return;
      }
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => {
        persistent = false;
        resolve(null);
      };
      transaction.onabort = () => resolve(null);
    });
  });
}

export async function loadSettings(): Promise<StudioSettings> {
  const stored = await tx<unknown>(STATE_STORE, 'readonly', (objectStore) => objectStore.get(STATE_KEY));
  if (stored === null) return normaliseSettings(memoryState ?? {});
  const settings = normaliseSettings(stored);
  memoryState = settings;
  return settings;
}

export async function saveSettings(settings: StudioSettings): Promise<void> {
  memoryState = settings;
  await tx(STATE_STORE, 'readwrite', (objectStore) => objectStore.put(JSON.parse(JSON.stringify(settings)), STATE_KEY));
}

/** The installation's own defaults ("set my current settings as the default"). */
export async function loadDefaultTemplate(): Promise<unknown | null> {
  return tx<unknown>(STATE_STORE, 'readonly', (objectStore) => objectStore.get(DEFAULTS_KEY));
}

export async function saveDefaultTemplate(settings: StudioSettings | null): Promise<void> {
  await tx(STATE_STORE, 'readwrite', (objectStore) => {
    if (settings === null) return objectStore.delete(DEFAULTS_KEY);
    return objectStore.put(JSON.parse(JSON.stringify(settings)), DEFAULTS_KEY);
  });
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  memoryAssets.set(id, blob);
  await tx(ASSET_STORE, 'readwrite', (objectStore) => objectStore.put(blob, id));
}

export async function getAsset(id: string): Promise<Blob | null> {
  const blob = await tx<Blob>(ASSET_STORE, 'readonly', (objectStore) => objectStore.get(id) as IDBRequest<Blob>);
  if (blob instanceof Blob) return blob;
  return memoryAssets.get(id) ?? null;
}

export async function deleteAsset(id: string): Promise<void> {
  memoryAssets.delete(id);
  await tx(ASSET_STORE, 'readwrite', (objectStore) => objectStore.delete(id));
}

/** Free every blob this plugin owns, used by "remove all". */
export async function clearAssets(ids: string[]): Promise<void> {
  for (const id of ids) await deleteAsset(id);
}
