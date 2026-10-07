/**
 * Device-local secrets that outgrow the Keychain / Keystore. SecureStore only
 * reliably holds small values (about 2 KB), but the device's post-quantum keys
 * and the registration seal are several KB. So each record gets its own random
 * 32-byte key in SecureStore, and its contents are sealed with that key
 * (XChaCha20-Poly1305) into the SQLite key-value store. A copy of the app
 * data alone opens nothing.
 *
 * Keys use AFTER_FIRST_UNLOCK so a background build can open the vault after
 * the OS restarted the app, while the device has been unlocked since boot.
 */
import * as SecureStore from "expo-secure-store";
import { Storage } from "expo-sqlite/kv-store";
import type { SealedSecretSlot } from "@dodi/client-state";
import {
  bytesToUtf8,
  fromBase64Url,
  generateSymmetricKey,
  open,
  seal,
  toBase64Url,
  utf8ToBytes,
} from "@dodi/crypto";

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** SecureStore keys allow [A-Za-z0-9._-] only. */
const keyName = (name: string): string => `dodi.seal.${name}`;
const dataName = (name: string): string => `dodi-sealed:${name}`;

export interface SealedSlot {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

export function sealedSlot(name: string): SealedSlot {
  // The record name rides along as additional data: a sealed blob copied onto
  // another slot fails to open.
  const aad = utf8ToBytes(name);
  return {
    async read() {
      const rawKey = await SecureStore.getItemAsync(keyName(name), SECURE_OPTIONS);
      const stored = Storage.getItemSync(dataName(name));
      if (!rawKey || !stored) return null;
      try {
        const [nonce, ciphertext] = stored.split(".");
        const plain = open(
          fromBase64Url(rawKey),
          { nonce: fromBase64Url(nonce), ciphertext: fromBase64Url(ciphertext) },
          aad,
        );
        return bytesToUtf8(plain);
      } catch {
        return null;
      }
    },
    async write(value) {
      // A fresh key per write: an older blob can't be replayed under it.
      const key = generateSymmetricKey();
      const sealed = seal(key, utf8ToBytes(value), aad);
      await SecureStore.setItemAsync(keyName(name), toBase64Url(key), SECURE_OPTIONS);
      Storage.setItemSync(
        dataName(name),
        `${toBase64Url(sealed.nonce)}.${toBase64Url(sealed.ciphertext)}`,
      );
    },
    async clear() {
      Storage.removeItemSync(dataName(name));
      await SecureStore.deleteItemAsync(keyName(name), SECURE_OPTIONS);
    },
  };
}

/** What a TTL-bounded slot seals: the secret plus when it was stashed. */
interface StampedSecret {
  stashedAt: number;
  secret: string;
}

function parseStamped(raw: string): StampedSecret | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StampedSecret).stashedAt === "number" &&
      typeof (parsed as StampedSecret).secret === "string"
    ) {
      return parsed as StampedSecret;
    }
  } catch {
    // Not a stamped record: treat as a miss.
  }
  return null;
}

/**
 * A single-use, TTL-bounded secret over a sealed slot (the registration seal;
 * web: lib/sealed-secret.ts). The stash time is sealed together with the
 * secret, so it can't be altered at rest either. `consume` always wipes the
 * slot and resolves null once the stash is older than `ttlMs`, or when the
 * record is unreadable (including one without a stash time).
 */
export function sealedSecretSlot(name: string, ttlMs: number): SealedSecretSlot {
  const slot = sealedSlot(name);
  return {
    stash: (secret) => slot.write(JSON.stringify({ stashedAt: Date.now(), secret } satisfies StampedSecret)),
    consume: async () => {
      const raw = await slot.read();
      await slot.clear();
      if (raw === null) return null;
      const stamped = parseStamped(raw);
      if (!stamped || Date.now() - stamped.stashedAt > ttlMs) return null;
      return stamped.secret;
    },
    clear: () => slot.clear(),
  };
}
