import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The voice-session builders assemble the config on the device from injected
 * sources: the key comes from `resolveVoice` (vault / managed key, never a
 * server session route), the in-game prompt gets the open game's id and the
 * kid's catalog, and snapshot play uses the inline game info without a fetch.
 */

const buildGameVoiceContextSpy = vi.fn((_input: unknown) => ({
  systemInstruction: "SYS",
  tools: [],
}));
vi.mock("../dodi-context", () => ({
  buildGameVoiceContext: (input: unknown) => buildGameVoiceContextSpy(input),
  buildHomeVoiceContext: () => ({ systemInstruction: "HOME", tools: [] }),
  isTodayBirthday: () => false,
}));

import type { Kid, Persona } from "@dodi/types/database";

import {
  buildGameVoiceConfig,
  buildHomeVoiceConfig,
  type VoiceSessionSources,
} from "./session-config";

const GEMINI_KEY = "AIza-test-key";

const KID = {
  id: "11111111-1111-1111-1111-111111111111",
  display_name: "Ada",
  birthdate: null,
  language: "en",
  memory: null,
  parent_notes: null,
  active_persona: null,
} as unknown as Kid;

const GAME = {
  id: "560b130f-80a6-4353-a750-deac44224c53",
  title: "Counting Quest",
  description: "Count the stars",
};

const OTHER_GAME = {
  id: "af7e848c-faa8-490c-bd38-3fdbafe1216c",
  title: "Buchstabenlabyrinth",
  description: "Find the letters",
  tags: ["reading"],
};

function makeSources(): VoiceSessionSources & {
  loadGameInfo: ReturnType<typeof vi.fn>;
  loadFriendNames: ReturnType<typeof vi.fn>;
} {
  return {
    loadKid: vi.fn(async () => KID),
    resolveVoice: vi.fn(async () => ({
      provider: "gemini" as const,
      model: "gemini-live-2.5",
      voiceName: "Puck",
      apiKey: GEMINI_KEY,
    })),
    getActivePersona: vi.fn(async () => ({ name: "dodi", soul: "SOUL" }) as Persona),
    loadGameCatalog: vi.fn(async () => [
      { ...GAME, tags: [] },
      OTHER_GAME,
    ]),
    loadGameInfo: vi.fn(async () => ({
      title: GAME.title,
      description: GAME.description,
      markdown: "# game",
      codeBundle: "<html></html>",
      capabilities: ["save_state"],
    })),
    loadFriendNames: vi.fn(async () => ["Bo"]),
  };
}

const GAME_CTX = {
  gameId: GAME.id,
  markdown: "",
  codeBundle: "",
  gameState: {},
  capabilities: [],
};

describe("voice session config builders", () => {
  beforeEach(() => {
    buildGameVoiceContextSpy.mockClear();
  });

  it("uses the resolved voice key and model, never a server session route", async () => {
    const sources = makeSources();
    const config = await buildGameVoiceConfig(sources, KID.id, GAME_CTX);

    expect(config.apiKey).toBe(GEMINI_KEY);
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-live-2.5");
    expect(config.voiceName).toBe("Puck");
    expect(config.systemInstruction).toBe("SYS");
    expect(config.language).toBe("en");
  });

  it("hands the in-game prompt the open game's id and the kid's catalog for launch_game", async () => {
    await buildGameVoiceConfig(makeSources(), KID.id, GAME_CTX);

    expect(buildGameVoiceContextSpy).toHaveBeenCalledTimes(1);
    const input = buildGameVoiceContextSpy.mock.calls[0][0] as {
      gameId: string;
      gameCatalog: Array<{ id: string; title: string; tags: string[] }>;
      friendNames: string[];
    };
    expect(input.gameId).toBe(GAME.id);
    expect(input.gameCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: GAME.id, title: GAME.title }),
        expect.objectContaining({ id: OTHER_GAME.id, title: OTHER_GAME.title, tags: ["reading"] }),
      ]),
    );
    // save_state games get the friend names (share_snapshot).
    expect(input.friendNames).toEqual(["Bo"]);
  });

  it("still connects when the catalog fails to load (launch_game becomes library-only)", async () => {
    const sources = makeSources();
    sources.loadGameCatalog = vi.fn(async () => {
      throw new Error("offline");
    });
    await buildGameVoiceConfig(sources, KID.id, GAME_CTX);
    const input = buildGameVoiceContextSpy.mock.calls[0][0] as { gameCatalog: unknown[] };
    expect(input.gameCatalog).toEqual([]);
  });

  it("uses inline info for snapshot play without fetching the game row", async () => {
    const sources = makeSources();
    await buildGameVoiceConfig(sources, KID.id, {
      ...GAME_CTX,
      inline: { title: "Snap", description: "A snapshot" },
    });
    expect(sources.loadGameInfo).not.toHaveBeenCalled();
    expect(sources.loadFriendNames).not.toHaveBeenCalled();
    const input = buildGameVoiceContextSpy.mock.calls[0][0] as { gameTitle: string };
    expect(input.gameTitle).toBe("Snap");
  });

  it("propagates a missing voice key as a clear error", async () => {
    const sources = makeSources();
    sources.resolveVoice = vi.fn(async () => {
      throw new Error("No API key configured for gemini");
    });
    await expect(buildHomeVoiceConfig(sources, KID.id)).rejects.toThrow(
      "No API key configured for gemini",
    );
  });

  it("throws when the kid is unknown", async () => {
    const sources = makeSources();
    sources.loadKid = vi.fn(async () => null);
    await expect(buildHomeVoiceConfig(sources, "nope")).rejects.toThrow("Kid not found");
  });
});
