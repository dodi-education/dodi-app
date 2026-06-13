import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the "No API key found for provider: gemini" 500 when
 * loading a game.
 *
 * Under the E2EE re-architecture the provider key is sealed in the vault and the
 * server can no longer decrypt it, so the obsolete `/api/games/[id]/session`
 * route (which called the server-side `decryptProviderKey`) threw. The voice
 * session is now assembled client-side: `buildGameVoiceConfig` must source the
 * provider key from the vault providers store and never hit a server session
 * route.
 */

const GEMINI_KEY = "AIza-test-key";

const PROFILE = {
  id: "11111111-1111-1111-1111-111111111111",
  display_name: "Ada",
  birthdate: null,
  language: "en",
  memory: null,
  parent_notes: null,
  active_persona_id: null,
};

vi.mock("@/stores/profile-store", () => ({
  useProfileStore: { getState: () => ({ loadOne: async () => PROFILE }) },
}));

const getKey = vi.fn((id: string) => (id === "gemini" ? GEMINI_KEY : null));
vi.mock("@/stores/providers-store", () => ({
  useProvidersStore: {
    getState: () => ({ providers: { gemini: {} }, load: async () => {}, getKey }),
  },
}));

vi.mock("@/stores/vault-store", () => ({
  useVaultStore: { getState: () => ({ session: {} }) },
}));

vi.mock("@/lib/vault", () => ({
  decryptPersona: (_session: unknown, p: Record<string, unknown>) => ({
    ...p,
    soul: "SOUL",
  }),
}));

vi.mock("@/lib/services/dodi-context", () => ({
  buildGameVoiceContext: () => ({ systemInstruction: "SYS", tools: [] }),
  buildHomeVoiceContext: () => ({ systemInstruction: "SYS", tools: [] }),
  isTodayBirthday: () => false,
}));

import { buildGameVoiceConfig } from "@/lib/ai/voice-session";

const MODEL_CONFIG = {
  voiceProvider: "gemini",
  voiceModel: "gemini-live-2.5",
  voiceName: "Puck",
};

const GAME = {
  id: "560b130f-80a6-4353-a750-deac44224c53",
  title: "Counting Quest",
  description: "Count the stars",
  subject: "math",
  markdown: "# game",
  code_bundle: "<html></html>",
  tags: [],
};

function routedFetch() {
  return vi.fn(async (url: string) => {
    if (url === "/api/ai/config") {
      return { ok: true, json: async () => MODEL_CONFIG };
    }
    if (url === "/api/personas") {
      return { ok: true, json: async () => [{ id: "p", is_system_default: true, soul: "enc" }] };
    }
    if (url.startsWith("/api/games/")) {
      return { ok: true, json: async () => GAME };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("buildGameVoiceConfig — E2EE key sourcing", () => {
  let fetchMock: ReturnType<typeof routedFetch>;

  beforeEach(() => {
    fetchMock = routedFetch();
    global.fetch = fetchMock as unknown as typeof fetch;
    getKey.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sources the provider key from the vault, not a server session route", async () => {
    const config = await buildGameVoiceConfig(PROFILE.id, GAME.id, {});

    expect(config.apiKey).toBe(GEMINI_KEY);
    expect(config.model).toBe(MODEL_CONFIG.voiceModel);
    expect(getKey).toHaveBeenCalledWith("gemini");

    // The obsolete server session route must never be called.
    const calledUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u) => u.includes("/session"))).toBe(false);
  });

  it("throws a clear client error (not a server 500) when the vault has no key", async () => {
    getKey.mockReturnValueOnce(null);

    await expect(buildGameVoiceConfig(PROFILE.id, GAME.id, {})).rejects.toThrow(
      "No API key configured for gemini",
    );
  });
});
