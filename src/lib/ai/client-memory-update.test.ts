import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Coverage for the hardened end-of-day memory write. `runClientMemoryUpdate`
 * must return `true` ONLY when the encrypted dossier was successfully PATCHed,
 * and `false` (never throw) for every "can't process now" condition so the
 * caller keeps its outbox for retry.
 */

const { loadOne, invalidate, getKey, vaultState, provider } = vi.hoisted(() => ({
  loadOne: vi.fn(),
  invalidate: vi.fn(),
  getKey: vi.fn(),
  vaultState: { session: {} as unknown },
  provider: { generateJson: vi.fn(), generateText: vi.fn() },
}));

vi.mock("@/stores/profile-store", () => ({
  useProfileStore: { getState: () => ({ loadOne, invalidate }) },
}));

vi.mock("@/stores/providers-store", () => ({
  useProvidersStore: {
    getState: () => ({ providers: { gemini: {} }, load: async () => {}, getKey }),
  },
}));

vi.mock("@/stores/vault-store", () => ({
  useVaultStore: { getState: () => ({ session: vaultState.session }) },
}));

vi.mock("@/lib/ai/voice-session", () => ({
  getActivePersona: async () => ({ soul: "SOUL" }),
}));

vi.mock("@/lib/vault", () => ({
  encryptProfileFields: (_s: unknown, fields: { memory?: string | null }) => ({
    memory: `enc:${fields.memory}`,
  }),
}));

vi.mock("@/lib/ai/client-thinking", () => ({
  createClientThinkingProvider: () => provider,
}));

import { runClientMemoryUpdate } from "@/lib/ai/client-memory-update";

const PROFILE = { id: "pid", memory: null, active_persona_id: null };

const FULL_CONFIG = {
  voiceProvider: "gemini",
  voiceModel: "gemini-live",
  voiceName: "Puck",
  thinkingProvider: "gemini",
  thinkingModel: "gemini-3.5-flash",
};

function routedFetch(opts: { config?: unknown; patchOk?: boolean } = {}) {
  const { config = FULL_CONFIG, patchOk = true } = opts;
  return vi.fn(async (url: string) => {
    if (url === "/api/ai/config") return { ok: true, json: async () => config };
    if (url.startsWith("/api/profiles/")) {
      return { ok: patchOk, json: async () => ({}) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("runClientMemoryUpdate", () => {
  let fetchMock: ReturnType<typeof routedFetch>;

  beforeEach(() => {
    vaultState.session = {};
    loadOne.mockResolvedValue(PROFILE);
    getKey.mockReturnValue("AIza-key");
    provider.generateJson.mockResolvedValue({ memory: "NEW DOSSIER" });
    provider.generateText.mockResolvedValue("NEW DOSSIER");
    fetchMock = routedFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns true and invalidates the cache on a successful PATCH", async () => {
    const ok = await runClientMemoryUpdate("pid", "transcript");

    expect(ok).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<
      [string, { body: string }]
    >;
    const patch = calls.find((c) => c[0].startsWith("/api/profiles/"));
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch![1].body)).toEqual({ memory: "enc:NEW DOSSIER" });
  });

  it("returns false and does not invalidate when the PATCH fails", async () => {
    fetchMock = routedFetch({ patchOk: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await runClientMemoryUpdate("pid", "transcript");

    expect(ok).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("returns false (not throw) when the vault is terminally locked", async () => {
    loadOne.mockRejectedValueOnce(new Error("Vault is locked"));

    await expect(runClientMemoryUpdate("pid", "t")).resolves.toBe(false);
  });

  it("returns false when the session is missing after load (defensive)", async () => {
    vaultState.session = null;

    const ok = await runClientMemoryUpdate("pid", "t");

    expect(ok).toBe(false);
  });

  it("returns false and skips the PATCH when no thinking provider is configured", async () => {
    fetchMock = routedFetch({
      config: { voiceProvider: "gemini", voiceModel: "x", voiceName: "Puck" },
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await runClientMemoryUpdate("pid", "t");

    expect(ok).toBe(false);
    const calledProfiles = fetchMock.mock.calls.some((c) =>
      String(c[0]).startsWith("/api/profiles/"),
    );
    expect(calledProfiles).toBe(false);
  });

  it("returns false when the thinking provider has no API key in the vault", async () => {
    getKey.mockReturnValue(null);

    const ok = await runClientMemoryUpdate("pid", "t");

    expect(ok).toBe(false);
  });
});
