/**
 * In-memory stand-in for `expo-secure-store` for Node tests:
 * `vi.mock("expo-secure-store", () => import("@/test-support/fake-secure-store"))`.
 * Enforces the native key alphabet ([A-Za-z0-9._-]) the adapters rely on.
 */
const items = new Map<string, string>();
const VALID_KEY = /^[\w.-]+$/;

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

export type SecureStoreOptions = { keychainAccessible?: number; keychainService?: string };

let isFailing = false;

/** Empty store that works again (a fresh install). */
export function resetSecureStore(): void {
  items.clear();
  isFailing = false;
}

/** Every call throws from now on (a locked keychain), until the next reset. */
export function failSecureStore(): void {
  isFailing = true;
}

/** Every stored key and value. */
export function dumpSecureStore(): string {
  return [...items.entries()].map(([key, value]) => `${key}=${value}`).join("\n");
}

function checkKey(key: string): void {
  if (isFailing) throw new Error("fake SecureStore: keychain unavailable");
  if (!VALID_KEY.test(key)) throw new Error(`Invalid key provided to SecureStore: ${key}`);
}

export async function getItemAsync(key: string): Promise<string | null> {
  checkKey(key);
  return items.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  checkKey(key);
  items.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  checkKey(key);
  items.delete(key);
}

export function getItem(key: string): string | null {
  checkKey(key);
  return items.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  checkKey(key);
  items.set(key, value);
}
