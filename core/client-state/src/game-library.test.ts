import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { VaultSession } from "@dodi/vault";
import { buildGameExportFiles, GameImportError, parseGameExportFiles } from "@dodi/games/export";
import { packGameExportZip, unpackGameExportZip } from "@dodi/games/export-zip";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import type { Game } from "@dodi/types/database";
import type { DiscoverGameDetail } from "@dodi/types/games";

import {
  buildGameListItems,
  copyCreateFields,
  copyOwnedGame,
  deleteGame,
  editedAgo,
  primaryKidIdOf,
  remixDiscoverGame,
} from "./game-library";
import {
  audienceFromSharing,
  isAudienceKidSelected,
  isSharingAdded,
  loadDiscoverPreview,
  saveGameSharing,
  selectFamilyAudience,
  toggleAudienceKid,
  unshareDiscoverGame,
} from "./game-sharing";
import { createGameCrypto, type AccountGame, type GameStore, type GameStoreState } from "./game-store";
import {
  buildGameExportArchive,
  importErrorKey,
  importGame,
  importPrimaryKidId,
  loadExportTranscript,
  parseGameImportArchive,
} from "./game-transfer";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

type Route = Response | Error | ((init?: RequestInit) => Response);

function routedApi(routes: Record<string, Route>): PlatformApi & {
  request: ReturnType<typeof vi.fn>;
} {
  return {
    request: vi.fn(async (path: string, init?: RequestInit) => {
      const route = routes[path];
      if (!route) throw new Error(`unexpected ${path}`);
      if (route instanceof Error) throw route;
      return typeof route === "function" ? route(init) : route;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function bodyOf(api: { request: ReturnType<typeof vi.fn> }, path: string): Record<string, unknown> {
  const call = api.request.mock.calls.find(([p]) => p === path);
  if (!call) throw new Error(`no call to ${path}`);
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

function fakeGames(rows: Record<string, Game> = {}) {
  const loadOne = vi.fn(async (id: string) => rows[id] ?? null);
  const invalidate = vi.fn();
  const patchLocal = vi.fn();
  const patchDiscoverSharing = vi.fn();
  const games = createStore(
    () =>
      ({
        byKid: { k1: [] },
        loadOne,
        invalidate,
        patchLocal,
        patchDiscoverSharing,
      }) as unknown as GameStoreState,
  ) as GameStore;
  return { games, loadOne, invalidate, patchLocal, patchDiscoverSharing };
}

function unlockedVault(): { vault: VaultStore; session: VaultSession } {
  const session = new VaultSession(new Uint8Array(32).fill(7));
  const vault = createStore(
    () => ({ session, status: "unlocked" }) as unknown as VaultState,
  ) as VaultStore;
  return { vault, session };
}

const BG = "data:image/png;base64,iVBORw0KGgo=";
const BUNDLE = `<!doctype html><html><body><style id="background-image">:root{--background-image:url("${BG}")}</style><script>
    window.addEventListener('message', function (e) {
      var m = e.data;
      if (m.type === 'dodi:init') { parent.postMessage({ type: 'game:ready', payload: { capabilities: [] } }, '*'); }
      if (m.type === 'dodi:command') { parent.postMessage({ type: 'game:result' }, '*'); }
    });
  </script></body></html>`;

const GAME = {
  id: "g1",
  title: "Counting Comets",
  description: "Count them",
  markdown: "",
  code_bundle: BUNDLE,
  learning_goal: "counting",
  success_definition: "",
  success_criteria: { stars: 3 },
  preview_image: null,
  tags: ["math"],
  progress_kind: "open",
  target_age_min: 4,
  target_age_max: 8,
  estimated_duration_minutes: 5,
  metadata: { version: "1" },
  agent_transcript_enc: null,
} as unknown as Game;

describe("studio list rows", () => {
  it("names kids from the audience plus the owning kid, and falls back to the untitled title", () => {
    const games = [
      {
        ...GAME,
        title: "",
        kid_id: "k2",
        updated_at: "2026-09-01T00:00:00Z",
        is_active: true,
        plan_enc: "enc:v1:plan",
        sharing: { family: false, kidIds: ["k1", "k-gone"] },
        plays: 3,
        copies: 1,
      },
    ] as unknown as AccountGame[];
    const [item] = buildGameListItems(
      games,
      [
        { id: "k1", display_name: "Ada" },
        { id: "k2", display_name: "Ben" },
      ],
      "Untitled",
    );
    expect(item).toMatchObject({
      id: "g1",
      title: "Untitled",
      kidNames: ["Ada", "Ben"],
      isFamily: false,
      isPlanning: true,
      built: true,
      plays: 3,
      copies: 1,
    });
    expect(buildGameListItems(null, null, "x")).toEqual([]);
    const unbuilt = [{ ...games[0], code_bundle: UNBUILT_GAME_PLACEHOLDER }] as AccountGame[];
    expect(buildGameListItems(unbuilt, [], "x")[0].built).toBe(false);
  });

  it("says how long ago a game was edited", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(editedAgo("2026-10-01T08:00:00Z", now)).toEqual({ key: "editedToday" });
    expect(editedAgo("2026-09-28T12:00:00Z", now)).toEqual({
      key: "editedDaysAgo",
      values: { days: 3 },
    });
    expect(editedAgo("2026-09-10T12:00:00Z", now)).toEqual({
      key: "editedWeeksAgo",
      values: { weeks: 3 },
    });
  });

  it("creates copies under the first kid", () => {
    expect(primaryKidIdOf([{ id: "a" }, { id: "b" }])).toBe("a");
    expect(primaryKidIdOf([])).toBeNull();
    expect(primaryKidIdOf(null)).toBeNull();
  });
});

describe("delete", () => {
  it("drops the whole cache after a delete", async () => {
    const { games, invalidate } = fakeGames();
    const deps = { api: routedApi({ "/api/games/g1": json({}) }), games, gameCrypto: createGameCrypto(unlockedVault().vault) };
    await deleteGame(deps, "g1");
    expect(deps.api.request).toHaveBeenCalledWith("/api/games/g1", { method: "DELETE" });
    expect(invalidate).toHaveBeenCalled();
  });

  it("surfaces the server's error text, or an empty message", async () => {
    const { games, invalidate } = fakeGames();
    const gameCrypto = createGameCrypto(unlockedVault().vault);
    await expect(
      deleteGame({ api: routedApi({ "/api/games/g1": json({ error: "nope" }, 403) }), games, gameCrypto }, "g1"),
    ).rejects.toThrow("nope");
    await expect(
      deleteGame({ api: routedApi({ "/api/games/g1": new Response("", { status: 500 }) }), games, gameCrypto }, "g1"),
    ).rejects.toThrow(/^$/);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("copies (re-sealed under this vault)", () => {
  it("maps the source into create fields, dropping empty optionals", () => {
    expect(copyCreateFields({ ...GAME, success_criteria: {} } as Game)).toEqual({
      title: "Counting Comets",
      description: "Count them",
      markdown: undefined,
      codeBundle: BUNDLE,
      learningGoal: "counting",
      successDefinition: undefined,
      successCriteria: undefined,
      previewImage: undefined,
    });
  });

  it("copies an owned game: forced re-read, sealed content, plaintext facets, inactive", async () => {
    const { games, loadOne, invalidate } = fakeGames({ g1: GAME });
    const { vault, session } = unlockedVault();
    const api = routedApi({ "/api/games": json({ id: "new-1" }) });
    const id = await copyOwnedGame({ api, games, gameCrypto: createGameCrypto(vault) }, "g1", "k1");
    expect(id).toBe("new-1");
    expect(loadOne).toHaveBeenCalledWith("g1", undefined, true);
    const body = bodyOf(api, "/api/games");
    expect(body).toMatchObject({
      kidId: "k1",
      sourceGameId: "g1",
      tags: ["math"],
      progressKind: "open",
      targetAgeMin: 4,
      targetAgeMax: 8,
      estimatedDurationMinutes: 5,
      metadata: { version: "1" },
      isActive: false,
    });
    expect(String(body.title)).toMatch(/^enc:v1:/);
    expect(String(body.codeBundle)).toMatch(/^enc:v1:/);
    expect(session.decryptField(String(body.title))).toBe("Counting Comets");
    expect(invalidate).toHaveBeenCalled();
  });

  it("remixes a Discover game from its plaintext detail", async () => {
    const { games } = fakeGames();
    const { vault, session } = unlockedVault();
    const detail = { ...GAME, preview_image: "data:image/png;base64,AA" } as unknown as DiscoverGameDetail;
    const api = routedApi({
      "/api/discover/games/pub-1?locale=de": json(detail),
      "/api/games": json({ id: "new-2" }),
    });
    await expect(
      remixDiscoverGame({ api, games, gameCrypto: createGameCrypto(vault) }, "pub-1", "k1", "de"),
    ).resolves.toBe("new-2");
    const body = bodyOf(api, "/api/games");
    expect(body.sourceGameId).toBe("pub-1");
    expect(session.decryptField(String(body.previewImage))).toBe("data:image/png;base64,AA");
  });

  it("fails without creating anything when the source can't load", async () => {
    const { games } = fakeGames();
    const gameCrypto = createGameCrypto(unlockedVault().vault);
    const api = routedApi({ "/api/discover/games/x?locale=en": new Response("", { status: 404 }) });
    await expect(remixDiscoverGame({ api, games, gameCrypto }, "x", "k1", "en")).rejects.toThrow();
    await expect(copyOwnedGame({ api, games, gameCrypto }, "missing", "k1")).rejects.toThrow();
    expect(api.request).toHaveBeenCalledTimes(1);
  });
});

describe("sharing", () => {
  it("drives the audience picker", () => {
    const start = audienceFromSharing({ family: true, kidIds: [] });
    const one = toggleAudienceKid(start, "k1");
    expect(one).toEqual({ isFamily: false, audienceIds: ["k1"] });
    expect(isAudienceKidSelected(one, "k1")).toBe(true);
    expect(toggleAudienceKid(one, "k1").audienceIds).toEqual([]);
    expect(isAudienceKidSelected(selectFamilyAudience(), "k1")).toBe(false);
    expect(isSharingAdded({ family: false, kidIds: [] })).toBe(false);
    expect(isSharingAdded({ family: false, kidIds: ["k1"] })).toBe(true);
  });

  it("studio: PATCHes the audience, patches the row and drops the kid libraries", async () => {
    const { games, patchLocal } = fakeGames();
    const api = routedApi({ "/api/games/g1": json({}) });
    const sharing = await saveGameSharing({ api, games }, "studio", "g1", {
      isFamily: true,
      audienceIds: ["k1"],
    });
    expect(sharing).toEqual({ family: true, kidIds: [] });
    expect(bodyOf(api, "/api/games/g1")).toEqual({ audience: { isFamily: true, audienceIds: ["k1"] } });
    expect(patchLocal).toHaveBeenCalledWith("g1", { sharing });
    expect(games.getState().byKid).toEqual({});
  });

  it("discover: PUTs play-in-place sharing and adopts the server's state", async () => {
    const { games, patchDiscoverSharing } = fakeGames();
    const saved = { family: false, kidIds: ["k1"] };
    const api = routedApi({ "/api/discover/games/p1/sharing": json({ sharing: saved }) });
    await expect(
      saveGameSharing({ api, games }, "discover", "p1", { isFamily: false, audienceIds: ["k1"] }),
    ).resolves.toEqual(saved);
    expect(patchDiscoverSharing).toHaveBeenCalledWith("p1", saved);
  });

  it("unshares a Discover game and fails loudly on errors", async () => {
    const { games, patchDiscoverSharing } = fakeGames();
    const api = routedApi({ "/api/discover/games/p1/sharing": json({}) });
    await unshareDiscoverGame({ api, games }, "p1");
    expect(bodyOf(api, "/api/discover/games/p1/sharing")).toEqual({ isFamily: false, audienceIds: [] });
    expect(patchDiscoverSharing).toHaveBeenCalledWith("p1", { family: false, kidIds: [] });

    const failing = routedApi({ "/api/discover/games/p1/sharing": json({}, 500) });
    await expect(unshareDiscoverGame({ api: failing, games }, "p1")).rejects.toThrow();
    await expect(
      saveGameSharing({ api: failing, games }, "discover", "p1", selectFamilyAudience()),
    ).rejects.toThrow();
  });

  it("loads the preview: 404 → null, sharing failure → empty audience", async () => {
    const detail = { id: "p1", title: "T" };
    await expect(
      loadDiscoverPreview(
        routedApi({
          "/api/discover/games/p1?locale=en": json(detail),
          "/api/discover/games/p1/sharing": json({}, 500),
        }),
        "p1",
        "en",
      ),
    ).resolves.toEqual({ detail, sharing: { family: false, kidIds: [] } });
    await expect(
      loadDiscoverPreview(
        routedApi({
          "/api/discover/games/p1?locale=en": json({}, 404),
          "/api/discover/games/p1/sharing": json({ sharing: { family: true, kidIds: [] } }),
        }),
        "p1",
        "en",
      ),
    ).resolves.toBeNull();
  });
});

describe("export", () => {
  it("unseals an owned game's conversation, null when absent or unreadable", async () => {
    const { vault, session } = unlockedVault();
    const transcript = [{ role: "user", text: "hi" }];
    const { games } = fakeGames({
      a: { ...GAME, agent_transcript_enc: session.encryptJson(transcript) } as Game,
      b: { ...GAME, agent_transcript_enc: session.encryptJson([]) } as Game,
      c: { ...GAME, agent_transcript_enc: "garbage" } as Game,
    });
    await expect(loadExportTranscript({ games, vault }, "a")).resolves.toEqual(transcript);
    await expect(loadExportTranscript({ games, vault }, "b")).resolves.toBeNull();
    await expect(loadExportTranscript({ games, vault }, "c")).resolves.toBeNull();
    const locked = createStore(() => ({ session: null }) as unknown as VaultState) as VaultStore;
    await expect(loadExportTranscript({ games, vault: locked }, "a")).resolves.toBeNull();
  });

  it("packs an owned game with the opted-in conversation", async () => {
    const { games, loadOne } = fakeGames({ g1: GAME });
    const archive = await buildGameExportArchive(
      { api: routedApi({}), games },
      { gameId: "g1", source: "owned", transcript: [{ role: "user", text: "hi" }], appVersion: "test" },
    );
    expect(loadOne).toHaveBeenCalledWith("g1", undefined, true);
    expect(archive.fileName).toMatch(/\.dodi-game\.zip$/);
    const parsed = parseGameExportFiles(unpackGameExportZip(archive.bytes));
    expect(parsed.manifest.title).toBe("Counting Comets");
    expect(parsed.transcript).not.toBeNull();
  });

  it("packs a Discover game without a conversation", async () => {
    const { games } = fakeGames();
    const api = routedApi({ "/api/discover/games/p1": json(GAME) });
    const archive = await buildGameExportArchive(
      { api, games },
      { gameId: "p1", source: "discover", transcript: [{ role: "user", text: "x" }], appVersion: "test" },
    );
    expect(parseGameExportFiles(unpackGameExportZip(archive.bytes)).transcript).toBeNull();

    const failing = routedApi({ "/api/discover/games/p1": json({}, 404) });
    await expect(
      buildGameExportArchive(
        { api: failing, games },
        { gameId: "p1", source: "discover", transcript: null, appVersion: "test" },
      ),
    ).rejects.toThrow("Failed to load the game for export");
  });
});

describe("import", () => {
  const archive = (): Uint8Array =>
    packGameExportZip(
      buildGameExportFiles({ game: GAME, transcript: [{ role: "user", text: "hi" }], appVersion: "test" }),
    );

  it("parses an archive and maps failures to message keys", () => {
    expect(parseGameImportArchive(archive()).manifest.title).toBe("Counting Comets");
    let caught: unknown;
    try {
      parseGameImportArchive(new TextEncoder().encode("not a zip"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GameImportError);
    expect(importErrorKey(caught)).toBe("importErrArchiveInvalid");
    expect(importErrorKey(new GameImportError("unsafe-code", "x"))).toBe("importErrUnsafeCode");
    expect(importErrorKey(new Error("other"))).toBe("importErrArchiveInvalid");
  });

  it("picks the kid the import is created under", () => {
    expect(importPrimaryKidId({ isFamily: true, audienceIds: [] }, ["a", "b"])).toBe("a");
    expect(importPrimaryKidId({ isFamily: false, audienceIds: ["b"] }, ["a", "b"])).toBe("b");
    expect(importPrimaryKidId({ isFamily: false, audienceIds: [] }, ["a"])).toBeNull();
    expect(importPrimaryKidId({ isFamily: true, audienceIds: [] }, [])).toBeNull();
  });

  it("seals the content and conversation, posts inactive with the audience", async () => {
    const { games, invalidate } = fakeGames();
    const { vault, session } = unlockedVault();
    const api = routedApi({ "/api/games": json({ id: "imp-1" }) });
    const id = await importGame(
      { api, games, gameCrypto: createGameCrypto(vault), vault },
      { parsed: parseGameImportArchive(archive()), kidId: "k1", audience: { isFamily: false, audienceIds: ["k1"] } },
    );
    expect(id).toBe("imp-1");
    const body = bodyOf(api, "/api/games");
    expect(body).toMatchObject({
      kidId: "k1",
      isActive: false,
      audience: { isFamily: false, audienceIds: ["k1"] },
      targetAgeMin: 4,
    });
    expect(body.sourceGameId).toBeUndefined();
    expect(session.decryptField(String(body.title))).toBe("Counting Comets");
    expect(session.decryptJson(String(body.agentTranscriptEnc))).not.toBeNull();
    expect(invalidate).toHaveBeenCalled();
  });

  it("surfaces the server's error, or the HTTP status", async () => {
    const { games } = fakeGames();
    const { vault } = unlockedVault();
    const parsed = parseGameImportArchive(archive());
    const deps = (res: Response) => ({
      api: routedApi({ "/api/games": res }),
      games,
      gameCrypto: createGameCrypto(vault),
      vault,
    });
    const audience = selectFamilyAudience();
    await expect(importGame(deps(json({ error: "limit" }, 400)), { parsed, kidId: "k1", audience })).rejects.toThrow(
      "limit",
    );
    await expect(
      importGame(deps(new Response("", { status: 502 })), { parsed, kidId: "k1", audience }),
    ).rejects.toThrow("HTTP 502");
  });
});
