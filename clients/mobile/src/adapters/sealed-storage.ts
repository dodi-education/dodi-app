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
