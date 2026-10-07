import { vi } from "vitest";
import type { ClientPlatform } from "@dodi/client-state";
import {
  describeDeviceKeystoreContract,
  describeKeyValueStorageContract,
  describeOfflineCacheContract,
  describeSealedSecretSlotContract,
} from "@dodi/client-state/platform.contract";

import { dumpIndexedDb, installFreshIndexedDb } from "@/test-support/fake-indexeddb";
import { MemoryStorage } from "@/test-support/memory-storage";

// Capture the platform this module hands the shared stores, then run the port
// contracts against its real adapters over fake-indexeddb and an in-memory
// Web Storage. WebCrypto is Node's.
const captured = vi.hoisted(() => ({ platform: null as ClientPlatform | null }));

vi.mock("@dodi/client-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dodi/client-state")>()),
  createClientState: (platform: ClientPlatform) => {
    captured.platform = platform;
    return { connectivity: { getState: () => ({ reportOnline() {}, reportOffline() {} }) } };
  },
}));
vi.mock("@/lib/argon2-worker", () => ({}));

let localStorage = new MemoryStorage();
vi.stubGlobal("window", {
  get localStorage() {
    return localStorage;
  },
  sessionStorage: new MemoryStorage(),
  addEventListener: () => {},
});
// The offline cache picks its backend when the module loads.
installFreshIndexedDb();
await import("./client-state");

function platform(): ClientPlatform {
  if (!captured.platform) throw new Error("lib/client-state did not create its client state");
  return captured.platform;
}

/** IndexedDB stops working (private mode, a blocked or corrupt profile). */
function breakIndexedDb(): void {
  vi.stubGlobal("indexedDB", {
    open: () => {
      throw new DOMException("IndexedDB is unavailable", "InvalidStateError");
    },
    databases: async () => [],
  });
}

// IndexedDB-backed adapters keep nothing in memory between calls, so a
// "reload" is the same object over the same IndexedDB.

describeOfflineCacheContract("web (IndexedDB, sealed vault keys)", {
  create: () => {
    installFreshIndexedDb();
    return platform().offlineCache;
  },
  reopen: () => platform().offlineCache,
  dumpStorage: dumpIndexedDb,
  breakStorage: breakIndexedDb,
});

describeDeviceKeystoreContract("web (IndexedDB)", {
  create: () => {
    installFreshIndexedDb();
    return platform().deviceKeystore;
  },
  reopen: () => platform().deviceKeystore,
});

describeSealedSecretSlotContract("web registrationSeal (IndexedDB + non-extractable AES-GCM)", {
  create: () => {
    installFreshIndexedDb();
    return platform().registrationSeal;
  },
  reopen: () => platform().registrationSeal,
  dumpStorage: dumpIndexedDb,
});

describeKeyValueStorageContract("web preferences (localStorage)", {
  create: () => {
    localStorage = new MemoryStorage();
    return platform().preferences;
  },
  reopen: () => platform().preferences,
});
