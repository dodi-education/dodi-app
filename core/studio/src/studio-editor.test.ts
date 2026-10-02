import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import { generateVaultMasterKey } from "@dodi/crypto";
import type { SuccessCriteria } from "@dodi/games/success";
import { VaultSession } from "@dodi/vault";

vi.mock("@dodi/ai/success-mapping", () => ({ mapSuccessDefinition: vi.fn() }));

import { mapSuccessDefinition } from "@dodi/ai/success-mapping";

import type { EditorGameCache, StudioEditorPorts, StudioTelemetry } from "./ports";
import { checkStudioProviders, persistTranscript, setGameActive } from "./studio-editor";
import { emptyStudioGame, type StudioGame } from "./studio-game";
import {
  createGameFromSettings,
  mapSettingsSuccessDefinition,
  patchGameSettings,
} from "./studio-settings";
import {
  listGameVersions,
  loadVersionCode,
  restoreGameVersion,
  saveCodeEdit,
} from "./studio-versions";

const mapper = vi.mocked(mapSuccessDefinition);

const KEY = "sk-ant-api03-secret-key";
const ENC = /^enc:v1:/;
const CRITERIA = { requiredMetrics: [] } as unknown as SuccessCriteria;

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown>;
}

let session: VaultSession;
let isUnlocked: boolean;
let calls: Call[];
/** Next responses by path; default: echo the PATCH body as the stored row. */
let responses: Map<string, () => Response>;
let ports: StudioEditorPorts & {
  games: {
    put: Mock<EditorGameCache["put"]>;
    patchLocal: Mock<EditorGameCache["patchLocal"]>;
    invalidate: Mock<EditorGameCache["invalidate"]>;
  };
};

beforeEach(() => {
  mapper.mockReset();
  session = new VaultSession(generateVaultMasterKey());
  isUnlocked = true;
  calls = [];
  responses = new Map();
  ports = {
    api: {
      request: async (path, init) => {
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : {};
        calls.push({ path, method: init?.method ?? "GET", body });
        const canned = responses.get(path);
        if (canned) return canned();
        return new Response(
          JSON.stringify({
            id: "game-1",
            is_system: false,
            publication_requested_at: null,
            current_game_version_id: "v2",
            ...body,
          }),
        );
      },
    },
    session: async () => session,
    currentSession: () => (isUnlocked ? session : null),
    execution: {
      resolveGame: async () => ({ provider: "anthropic", model: "claude-test", apiKey: KEY }),
      resolveImage: async () => null,
    },
    telemetry: {
      reportUsage: vi.fn<StudioTelemetry["reportUsage"]>(),
      reportError: vi.fn<StudioTelemetry["reportError"]>(),
    },
    games: {
      put: vi.fn<EditorGameCache["put"]>(),
      patchLocal: vi.fn<EditorGameCache["patchLocal"]>(),
      invalidate: vi.fn<EditorGameCache["invalidate"]>(),
    },
  };
});

const game = (patch: Partial<StudioGame> = {}): StudioGame => ({
  ...emptyStudioGame(),
  id: "game-1",
  title: "Space Math",
  learningGoal: "Add to 10",
  successDefinition: "3 rounds",
  tags: ["math"],
  ...patch,
});

const fail = (status: number, error: string) => (): Response =>
  new Response(JSON.stringify({ error }), { status });

describe("persistTranscript", () => {
  it("seals the thread onto the game row", async () => {
    await persistTranscript(ports, "game-1", [{ role: "user", text: "a rocket game" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "/api/games/game-1", method: "PATCH" });
    const enc = String(calls[0].body.agent_transcript_enc);
    expect(enc).toMatch(ENC);
    expect(session.decryptJson(enc)).toEqual([{ role: "user", text: "a rocket game" }]);
  });

  it("clears it for null, and never writes plaintext while the vault is locked", async () => {
    await persistTranscript(ports, "game-1", null);
    isUnlocked = false;
    await persistTranscript(ports, "game-1", [{ role: "user", text: "a rocket game" }]);
    expect(calls.map((c) => c.body.agent_transcript_enc)).toEqual([null, null]);
    expect(JSON.stringify(calls)).not.toContain("rocket");
  });
});

describe("setGameActive", () => {
  it("flips the cache first and PATCHes is_active", async () => {
    await setGameActive(ports, "game-1", true);
    expect(ports.games.patchLocal).toHaveBeenCalledWith("game-1", { is_active: true });
    expect(calls[0].body).toEqual({ is_active: true });
  });

  it("flips the cache back and rethrows the server's reason on failure", async () => {
    responses.set("/api/games/game-1", fail(403, "Not yours"));
    await expect(setGameActive(ports, "game-1", true)).rejects.toThrow("Not yours");
    expect(ports.games.patchLocal.mock.calls).toEqual([
      ["game-1", { is_active: true }],
      ["game-1", { is_active: false }],
    ]);
  });
});

describe("checkStudioProviders", () => {
  it("reports the game model early and the image key after", async () => {
    responses.set("/api/ai/config", () => new Response(JSON.stringify({ gameProvider: "anthropic" })));
    ports.execution.resolveImage = async () => ({ provider: "gemini", model: "img", apiKey: KEY });
    const early = vi.fn();
    await expect(checkStudioProviders(ports, early)).resolves.toEqual({
      hasGameProvider: true,
      hasImageProvider: true,
    });
    expect(early).toHaveBeenCalledWith(true);
  });

  it("reads failures as not configured", async () => {
    responses.set("/api/ai/config", fail(500, "down"));
    await expect(checkStudioProviders(ports)).resolves.toEqual({
      hasGameProvider: false,
      hasImageProvider: false,
    });
    responses.set("/api/ai/config", () => new Response(JSON.stringify({})));
    ports.execution.resolveImage = async () => {
      throw new Error("vault locked");
    };
    await expect(checkStudioProviders(ports)).resolves.toEqual({
      hasGameProvider: false,
      hasImageProvider: false,
    });
  });
});

describe("versions", () => {
  it("lists versions, null when unavailable", async () => {
    const versions = [{ id: "v2", previous_game_version_id: "v1", created_at: "2026-01-01" }];
    responses.set("/api/games/game-1/versions", () => new Response(JSON.stringify({ versions })));
    await expect(listGameVersions(ports, "game-1")).resolves.toEqual(versions);
    responses.set("/api/games/game-1/versions", fail(500, "down"));
    await expect(listGameVersions(ports, "game-1")).resolves.toBeNull();
  });

  it("opens a version's sealed code on the device", async () => {
    const sealed = session.encryptField("<html>v1</html>");
    responses.set(
      "/api/games/game-1/versions/v1",
      () => new Response(JSON.stringify({ id: "v1", code_bundle: sealed })),
    );
    await expect(loadVersionCode(ports, "game-1", "v1")).resolves.toBe("<html>v1</html>");
    responses.set("/api/games/game-1/versions/v1", fail(404, "gone"));
    await expect(loadVersionCode(ports, "game-1", "v1")).resolves.toBeNull();
  });

  it("restores a version and caches the decrypted row", async () => {
    responses.set(
      "/api/games/game-1",
      () =>
        new Response(
          JSON.stringify({
            id: "game-1",
            code_bundle: session.encryptField("<html>v1</html>"),
            current_game_version_id: "v1",
          }),
        ),
    );
    const row = await restoreGameVersion(ports, "game-1", "v1");
    expect(calls[0].body).toEqual({ restore_version_id: "v1" });
    expect(row.code_bundle).toBe("<html>v1</html>");
    expect(ports.games.put).toHaveBeenCalledWith(row);
  });

  it("sanitizes, then seals a manual code edit", async () => {
    const row = await saveCodeEdit(ports, "game-1", "  <html>edited</html>\n", {
      isNewVersion: false,
    });
    const body = calls[0].body;
    expect(body.create_version).toBe(false);
    expect(String(body.code_bundle)).toMatch(ENC);
    expect(JSON.stringify(body)).not.toContain("edited");
    // The echo is decrypted back: trimmed by the sanitizer.
    expect(row.code_bundle).toBe("<html>edited</html>");
    expect(ports.games.put).toHaveBeenCalledWith(row);
  });

  it("refuses an unsafe bundle before anything leaves the device", async () => {
    await expect(
      saveCodeEdit(ports, "game-1", '<script src="https://evil.example/x.js"></script>', {
        isNewVersion: true,
      }),
    ).rejects.toThrow(/External script/);
    expect(calls).toHaveLength(0);
  });
});

describe("settings save", () => {
  it("maps the success definition with the device's key", async () => {
    mapper.mockResolvedValue({ progressKind: "goal", successCriteria: CRITERIA });
    const steps: string[] = [];
    const mapped = await mapSettingsSuccessDefinition(ports, game(), (s) => steps.push(s));
    expect(mapped).toEqual({ progressKind: "goal", successCriteria: CRITERIA });
    expect(mapper).toHaveBeenCalledWith(
      { providerId: "anthropic", modelId: "claude-test", apiKey: KEY },
      "3 rounds",
      { learningGoal: "Add to 10" },
    );
    expect(steps).toEqual(["resolve_game_model", "map_success_definition"]);
  });

  it("yields null when mapping fails", async () => {
    mapper.mockRejectedValue(new Error("no key"));
    await expect(mapSettingsSuccessDefinition(ports, game())).resolves.toBeNull();
  });

  it("PATCHes sealed content fields and ends planning", async () => {
    const row = await patchGameSettings(ports, "game-1", game({ isActive: true }), {
      mapped: { progressKind: "goal", successCriteria: { requiredMetrics: [] } },
      isEndingPlanning: true,
    });
    const body = calls[0].body;
    for (const field of ["title", "learning_goal", "success_definition", "success_criteria"]) {
      expect(String(body[field])).toMatch(ENC);
    }
    expect(JSON.stringify(body)).not.toContain("Space Math");
    expect(JSON.stringify(body)).not.toContain("Add to 10");
    expect(body).toMatchObject({
      tags: ["math"],
      target_age_min: 4,
      target_age_max: 12,
      progress_kind: "goal",
      is_active: true,
      plan_enc: null,
      audience: { isFamily: true, audienceIds: [] },
      metadata: { perspective: null, generateBackgroundImage: false, generatePreviewImage: false },
    });
    expect(row.title).toBe("Space Math");
    expect(ports.games.put).toHaveBeenCalledWith(row);
  });

  it("leaves criteria and the plan envelope alone when not asked", async () => {
    await patchGameSettings(ports, "game-1", game(), { mapped: null, isEndingPlanning: false });
    const body = calls[0].body;
    expect(body).not.toHaveProperty("success_criteria");
    expect(body).not.toHaveProperty("progress_kind");
    expect(body).not.toHaveProperty("plan_enc");
  });

  it("creates a new game with the sealed placeholder and the sealed thread", async () => {
    responses.set("/api/games", () => new Response(JSON.stringify({ id: "game-9" })));
    const id = await createGameFromSettings(ports, {
      kidId: "kid-1",
      game: game({ id: null }),
      transcript: [{ role: "user", text: "a rocket game" }],
    });
    expect(id).toBe("game-9");
    const body = calls[0].body;
    expect(calls[0]).toMatchObject({ path: "/api/games", method: "POST" });
    for (const field of ["title", "learningGoal", "successDefinition", "codeBundle", "agentTranscriptEnc"]) {
      expect(String(body[field])).toMatch(ENC);
    }
    expect(JSON.stringify(body)).not.toContain("rocket");
    expect(body).toMatchObject({ kidId: "kid-1", progressKind: "goal", isActive: false });
    expect(ports.games.invalidate).toHaveBeenCalled();
  });

  it("omits the thread when the vault is locked", async () => {
    responses.set("/api/games", () => new Response(JSON.stringify({ id: "game-9" })));
    isUnlocked = false;
    await createGameFromSettings(ports, {
      kidId: "kid-1",
      game: game({ id: null }),
      transcript: [{ role: "user", text: "a rocket game" }],
    });
    expect(calls[0].body).not.toHaveProperty("agentTranscriptEnc");
  });
});
