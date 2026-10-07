/**
 * IndexedDB for Node tests (fake-indexeddb, structured clone included, so
 * CryptoKeys and typed arrays survive like in a browser). The adapters
 * reference `indexedDB` lazily, so swapping the global gives a fresh, empty
 * browser profile while modules stay loaded.
 */
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { vi } from "vitest";

/** Install an empty IndexedDB as the global `indexedDB` (a fresh browser profile). */
export function installFreshIndexedDb(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  return factory;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function textOf(value: unknown, seen = new Set<unknown>()): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "";
  seen.add(value);
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) {
    return new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (typeof CryptoKey !== "undefined" && value instanceof CryptoKey) return "[CryptoKey]";
  return Object.entries(value)
    .map(([key, inner]) => `${key}:${textOf(inner, seen)}`)
    .join("\n");
}

/**
 * Every record in every database of the current global IndexedDB as text
 * (binary values decoded as UTF-8), for "never stored in plaintext" checks.
 */
export async function dumpIndexedDb(): Promise<string> {
  const out: string[] = [];
  for (const info of await indexedDB.databases()) {
    if (!info.name) continue;
    const db = await requestValue(indexedDB.open(info.name));
    try {
      for (const storeName of Array.from(db.objectStoreNames)) {
        const store = db.transaction(storeName, "readonly").objectStore(storeName);
        const [keys, values] = await Promise.all([
          requestValue(store.getAllKeys()),
          requestValue(store.getAll()),
        ]);
        values.forEach((value, i) => out.push(`${info.name}/${storeName}/${String(keys[i])}\n${textOf(value)}`));
      }
    } finally {
      db.close();
    }
  }
  return out.join("\n");
}
