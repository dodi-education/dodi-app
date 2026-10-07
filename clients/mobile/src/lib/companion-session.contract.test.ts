import { vi } from "vitest";
import type { DeviceStorage } from "@dodi/client-state";
import { describeDeviceStorageContract } from "@dodi/client-state/platform.contract";

import { resetKeyValueStore } from "@/test-support/fake-kv-store";

// Capture the DeviceStorage this module hands the shared companion session
// (its outboxes, per-kid volume and greeting markers live there).
const captured = vi.hoisted(() => ({ storage: null as DeviceStorage | null }));

vi.mock("@dodi/client-state/companion-session", () => ({
  createCompanionSession: (deps: { storage: DeviceStorage }) => {
    captured.storage = deps.storage;
    return { store: { getState: () => ({ state: "disconnected", endSession: () => {} }) } };
  },
}));
vi.mock("expo-sqlite/kv-store", () => import("@/test-support/fake-kv-store"));
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }));
vi.mock("@/adapters/audio-port", () => ({ nativeAudioPort: {} }));
vi.mock("@/adapters/platform", () => ({ api: {}, mobilePlatform: { fetch: () => {} } }));
vi.mock("@/lib/client-state", () => ({ clientState: {} }));

await import("./companion-session");

function storage(): DeviceStorage {
  if (!captured.storage) throw new Error("companion-session did not create its session");
  return captured.storage;
}

describeDeviceStorageContract("mobile companion storage (SQLite key-value)", {
  create: () => {
    resetKeyValueStore();
    return storage();
  },
  reopen: () => storage(),
});
