import { describe, expect, it, vi } from "vitest";

/**
 * The companion's voice source resolves the provider key on the device through
 * the execution resolver (vault / managed key), reads only the plaintext model
 * selection from the platform, and fails with a clear client error when no key
 * is available (regression: the old server session route 500'd).
 */

vi.mock("@dodi/vault", () => ({
  decryptPersona: (_session: unknown, p: Record<string, unknown>) => ({ ...p, soul: "SOUL" }),
}));

import { createCompanionSources, type CompanionSourceDeps } from "./companion-sources";

const MODEL_CONFIG = { voiceProvider: "gemini", voiceModel: "gemini-live-2.5", voiceName: "Puck" };

function setup(apiKey: string | null): {
  sources: ReturnType<typeof createCompanionSources>;
  request: ReturnType<typeof vi.fn>;
  resolveExecution: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async (url: string) => {
    if (url === "/api/ai/config") return new Response(JSON.stringify(MODEL_CONFIG));
    if (url === "/api/personas") {
      return new Response(JSON.stringify([{ id: "p", is_system_default: true, soul: "enc" }]));
    }
    throw new Error(`unexpected request: ${url}`);
  });
  const resolveExecution = vi.fn(async (input: { provider: string; model?: string }) =>
    apiKey ? { provider: input.provider, model: input.model ?? "", apiKey } : null,
  );
  const deps = {
    api: { request },
    kids: { getState: () => ({ loadOne: async () => null }) },
    games: { getState: () => ({ loadForKid: async () => [], loadOne: async () => null }) },
    vault: { getState: () => ({ session: {} }) },
    execution: { resolveExecution, resolveThinking: async () => null },
  } as unknown as CompanionSourceDeps;
  return { sources: createCompanionSources(deps), request, resolveExecution };
}

describe("companion sources", () => {
  it("resolves the voice key on the device for the configured voice model", async () => {
    const { sources, request, resolveExecution } = setup("AIza-test-key");
    const voice = await sources.resolveVoice();

    expect(voice).toEqual({
      provider: "gemini",
      model: "gemini-live-2.5",
      voiceName: "Puck",
      apiKey: "AIza-test-key",
    });
    expect(resolveExecution).toHaveBeenCalledWith({
      provider: "gemini",
      category: "voice",
      model: "gemini-live-2.5",
      voiceName: "Puck",
    });
    // No server session route; only the plaintext model selection is fetched.
    expect(request.mock.calls.map((c) => c[0])).toEqual(["/api/ai/config"]);
  });

  it("throws a clear client error when the vault has no key", async () => {
    const { sources } = setup(null);
    await expect(sources.resolveVoice()).rejects.toThrow("No API key configured for gemini");
  });

  it("falls back to the system default persona and decrypts its soul", async () => {
    const { sources } = setup("k");
    const persona = await sources.getActivePersona("missing");
    expect(persona).toMatchObject({ id: "p", soul: "SOUL" });
  });
});
