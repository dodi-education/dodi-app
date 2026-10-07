import { vi } from "vitest";
import {
  describeDeviceKeystoreContract,
  describeKeyValueStorageContract,
  describeOfflineCacheContract,
  describeSealedSecretSlotContract,
} from "@dodi/client-state/platform.contract";

import { dumpKeyValueStore, failKeyValueStore, resetKeyValueStore } from "@/test-support/fake-kv-store";
import { dumpSecureStore, failSecureStore, resetSecureStore } from "@/test-support/fake-secure-store";
import { dumpFiles, resetFileSystem } from "@/test-support/fake-expo-file-system";
import {
  dumpSqliteDatabases,
  failSqliteDatabases,
  resetSqliteDatabases,
} from "@/test-support/fake-expo-sqlite";

import { mobilePlatform } from "./platform";

vi.mock("expo-sqlite/kv-store", () => import("@/test-support/fake-kv-store"));
vi.mock("expo-secure-store", () => import("@/test-support/fake-secure-store"));
vi.mock("expo-file-system", () => import("@/test-support/fake-expo-file-system"));
vi.mock("expo-sqlite", () => import("@/test-support/fake-expo-sqlite"));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
// The auth client (better-auth over SecureStore) is not under test here.
vi.mock("./auth", () => ({ getAccessToken: () => "" }));

/** Wipe every faked device store (a fresh install). */
function freshDevice(): void {
  resetKeyValueStore();
  resetSecureStore();
  resetFileSystem();
  resetSqliteDatabases();
}

/** SQLite, the key-value store and the keychain all fail from now on. */
function breakDevice(): void {
  failSqliteDatabases();
  failKeyValueStore();
  failSecureStore();
}

const dumpDevice = (): string =>
  [dumpKeyValueStore(), dumpSecureStore(), dumpSqliteDatabases(), dumpFiles()].join("\n");

// The adapters are stateless over the native stores, so a "restart" is the same
// object over stores that kept their contents.

describeOfflineCacheContract("mobile (SQLite + files, sealed vault keys)", {
  create: () => {
    freshDevice();
    return mobilePlatform.offlineCache;
  },
  reopen: () => mobilePlatform.offlineCache,
  dumpStorage: dumpDevice,
  breakStorage: breakDevice,
});

describeDeviceKeystoreContract("mobile (SecureStore-sealed SQLite)", {
  create: () => {
    freshDevice();
    return mobilePlatform.deviceKeystore;
  },
  reopen: () => mobilePlatform.deviceKeystore,
});

describeSealedSecretSlotContract("mobile registrationSeal (SecureStore-sealed SQLite)", {
  create: () => {
    freshDevice();
    return mobilePlatform.registrationSeal;
  },
  reopen: () => mobilePlatform.registrationSeal,
  dumpStorage: dumpDevice,
});

describeKeyValueStorageContract("mobile preferences (SQLite key-value)", {
  create: () => {
    freshDevice();
    return mobilePlatform.preferences;
  },
  reopen: () => mobilePlatform.preferences,
});
