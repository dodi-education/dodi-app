/**
 * In-memory stand-in for `expo-sqlite/kv-store` (`Storage`) for Node tests:
 * `vi.mock("expo-sqlite/kv-store", () => import("@/test-support/fake-kv-store"))`.
 * Like the SQLite-backed original, a missing key reads as null and values are
 * stored as given (strings).
 */
const rows = new Map<string, string>();
let isFailing = false;

/** Empty store that works again (a fresh install). */
export function resetKeyValueStore(): void {
  rows.clear();
  isFailing = false;
}

/** Every call throws from now on (a corrupt or full database), until the next reset. */
export function failKeyValueStore(): void {
  isFailing = true;
}

function check(): void {
  if (isFailing) throw new Error("fake kv-store: database unavailable");
}

/** Every stored key and value (for "never stored in plaintext" checks). */
export function dumpKeyValueStore(): string {
  return [...rows.entries()].map(([key, value]) => `${key}=${value}`).join("\n");
}

export const Storage = {
  getItemSync(key: string): string | null {
    check();
    return rows.get(key) ?? null;
  },
  setItemSync(key: string, value: string): void {
    check();
    rows.set(key, value);
  },
  removeItemSync(key: string): boolean {
    check();
    return rows.delete(key);
  },
  getAllKeysSync(): string[] {
    check();
    return [...rows.keys()];
  },
  clearSync(): boolean {
    check();
    rows.clear();
    return true;
  },
  async getItemAsync(key: string): Promise<string | null> {
    check();
    return rows.get(key) ?? null;
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    check();
    rows.set(key, value);
  },
  async removeItemAsync(key: string): Promise<boolean> {
    check();
    return rows.delete(key);
  },
  async getAllKeysAsync(): Promise<string[]> {
    check();
    return [...rows.keys()];
  },
  async clearAsync(): Promise<boolean> {
    check();
    rows.clear();
    return true;
  },
};

export default Storage;
