import { vi } from "vitest";
import type { DeviceStorage } from "@dodi/client-state";
import { describeDeviceStorageContract } from "@dodi/client-state/platform.contract";

import { MemoryStorage } from "@/test-support/memory-storage";

// Capture the DeviceStorage this module hands the shared companion session
// (its outboxes, per-kid volume and greeting markers live there).
const captured = vi.hoisted(() => ({ storage: null as DeviceStorage | null }));

vi.mock("@dodi/client-state/companion-session", () => ({
  createCompanionSession: (deps: { storage: DeviceStorage }) => {
    captured.storage = deps.storage;
    return {};
  },
}));
vi.mock("@/lib/ai/web-audio-port", () => ({ webAudioPort: {} }));
vi.mock("@/lib/client-state", () => ({ clientState: {} }));

let localStorage = new MemoryStorage();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
});
await import("./companion-session");

function storage(): DeviceStorage {
  if (!captured.storage) throw new Error("companion-session did not create its session");
  return captured.storage;
}

describeDeviceStorageContract("web companion storage (localStorage)", {
  create: () => {
    localStorage = new MemoryStorage();
    return storage();
  },
  reopen: () => storage(),
});
