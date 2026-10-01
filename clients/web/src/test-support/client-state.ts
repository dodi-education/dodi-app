/**
 * A `clientState` for tests that mock the web store modules: the REAL shared
 * game store and execution resolver (`@dodi/client-state`) over an unlocked
 * pass-through vault and a fake providers store, so a suite keeps exercising
 * the shared logic while it controls the keys. Use from a `vi.mock` factory:
 *
 *   vi.mock("@/lib/client-state", async () =>
 *     (await import("@/test-support/client-state")).testClientState({ getKey }));
 */
import { createStore } from "zustand/vanilla";
import {
  createConnectivityStore,
  createExecutionResolver,
  createGameStore,
  type OfflineCache,
  type PlatformApi,
  type ProvidersStore,
  type VaultStore,
} from "@dodi/client-state";

import { dodi } from "@/lib/api";

const noOfflineCache: OfflineCache = {
  writeVaultKeys: async () => {},
  readVaultKeys: async () => null,
  writeKidRows: async () => {},
  readKidRows: async () => null,
  writeGameRows: async () => {},
  readGameRows: async () => null,
};

export function testClientState(opts: {
  getKey: (providerId: string) => string | null;
}): { clientState: Record<string, unknown> } {
  const api = dodi as unknown as PlatformApi;
  // Rows pass through undecrypted: these suites are not about field crypto.
  const vault = createStore(() => ({
    session: { decryptField: (value: string | null) => value },
    status: "unlocked",
  })) as unknown as VaultStore;
  const providers = {
    getState: () => ({ providers: { gemini: {} }, load: async () => {}, getKey: opts.getKey }),
  } as unknown as ProvidersStore;
  const notConfigured = { getState: () => ({ load: async () => null }) };
  return {
    clientState: {
      games: createGameStore({
        api,
        offlineCache: noOfflineCache,
        vault,
        connectivity: createConnectivityStore(true),
      }),
      execution: createExecutionResolver({
        api,
        dodiAI: { isConfigured: () => false, request: () => Promise.reject(new Error("off")) },
        dodiAIDefaults: notConfigured as never,
        dodiAIKeys: notConfigured as never,
        providers,
      }),
    },
  };
}
