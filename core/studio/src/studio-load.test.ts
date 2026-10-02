import { describe, expect, it, vi } from "vitest";

import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import type { Game } from "@dodi/types/database";

import type { AgentCodeResult } from "@dodi/types/tasks";

import { emptyStudioGame } from "./studio-game";
import { loadStudioGame, studioGameFromRow } from "./studio-load";
import { gameAfterBuild } from "./studio-outcome";

function row(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    account_id: "acct-1",
    kid_id: "kid-9",
    title: "Stars",
    tags: ["math"],
    description: "Count stars",
    learning_goal: "Count to ten",
    success_definition: "",
    progress_kind: "open",
    success_criteria: null,
    target_age_min: 4,
    target_age_max: 8,
    code_bundle: "<html>game</html>",
    current_game_version_id: "v2",
    markdown: "",
    is_active: true,
    metadata: { perspective: "side", generatePreviewImage: true, capabilities: ["get_snapshot"] },
    preview_image: null,
    agent_transcript_enc: "enc:v1:t",
    plan_enc: null,
    ...overrides,
  } as Game;
}

describe("studioGameFromRow", () => {
  it("maps the row and its metadata", () => {
    const game = studioGameFromRow(row(), { family: true, kidIds: [] });
    expect(game).toMatchObject({
      id: "game-1",
      title: "Stars",
      learningGoal: "Count to ten",
      isFamily: true,
      audienceIds: [],
      built: true,
      isActive: true,
      perspective: "side",
      generateBackgroundImage: false,
      generatePreviewImage: true,
      capabilities: ["get_snapshot"],
      currentGameVersionId: "v2",
      agentTranscriptEnc: "enc:v1:t",
      planEnc: null,
    });
  });

  it("takes the shared kids, else the row's own kid", () => {
    expect(studioGameFromRow(row(), { family: false, kidIds: ["a", "b"] }).audienceIds).toEqual([
      "a",
      "b",
    ]);
    expect(studioGameFromRow(row(), { family: false, kidIds: [] }).audienceIds).toEqual(["kid-9"]);
    expect(
      studioGameFromRow(row({ kid_id: null }), { family: false, kidIds: [] }).audienceIds,
    ).toEqual([]);
  });

  it("treats the unbuilt placeholder as not built", () => {
    const game = studioGameFromRow(row({ code_bundle: UNBUILT_GAME_PLACEHOLDER }), {
      family: true,
      kidIds: [],
    });
    expect(game.built).toBe(false);
  });
});

describe("loadStudioGame", () => {
  const sharing = (body: unknown, ok = true) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));

  it("opens the account's own game with its sharing", async () => {
    const request = sharing({ family: false, kidIds: ["k1"] });
    const game = await loadStudioGame(
      { api: { request }, loadGame: async () => row(), sessionUserId: async () => "acct-1" },
      "game-1",
    );
    expect(request).toHaveBeenCalledWith("/api/games/game-1/sharing");
    expect(game?.audienceIds).toEqual(["k1"]);
  });

  it("falls back to the row's kid when the sharing call fails", async () => {
    const game = await loadStudioGame(
      {
        api: { request: sharing({}, false) },
        loadGame: async () => row(),
        sessionUserId: async () => "acct-1",
      },
      "game-1",
    );
    expect(game?.audienceIds).toEqual(["kid-9"]);
    expect(game?.isFamily).toBe(false);
  });

  it("is null for a missing game, another account's game, or no session", async () => {
    const api = { request: sharing({ family: true, kidIds: [] }) };
    expect(
      await loadStudioGame({ api, loadGame: async () => null, sessionUserId: async () => "acct-1" }, "x"),
    ).toBeNull();
    expect(
      await loadStudioGame({ api, loadGame: async () => row(), sessionUserId: async () => "other" }, "x"),
    ).toBeNull();
    expect(
      await loadStudioGame({ api, loadGame: async () => row(), sessionUserId: async () => null }, "x"),
    ).toBeNull();
  });
});

describe("gameAfterBuild", () => {
  const result = {
    title: "Built",
    tags: ["numbers"],
    description: "d",
    learningGoal: "g",
    successDefinition: "s",
    progressKind: "goal",
    successCriteria: { requiredMetrics: [] },
    markdown: "m",
    metadata: { capabilities: ["get_snapshot"] },
  } as unknown as AgentCodeResult;

  const outcome = (savedRow: Game | null) => ({
    kind: "built" as const,
    transcript: [],
    result,
    code: "<html>new</html>",
    isCodeChanged: true,
    savedRow,
    backgroundNotice: null,
    previewNotice: null,
    hasVisualCheckNotice: false,
  });

  it("adopts the result and the saved row's version head and preview", () => {
    const before = { ...emptyStudioGame(), id: "game-1", currentGameVersionId: "v1" };
    const after = gameAfterBuild(
      before,
      outcome(row({ current_game_version_id: "v3", preview_image: "data:p" })),
    );
    expect(after).toMatchObject({
      id: "game-1",
      built: true,
      title: "Built",
      codeBundle: "<html>new</html>",
      capabilities: ["get_snapshot"],
      currentGameVersionId: "v3",
      previewImage: "data:p",
    });
  });

  it("keeps the old version head when the save failed", () => {
    const before = { ...emptyStudioGame(), id: "game-1", currentGameVersionId: "v1" };
    expect(gameAfterBuild(before, outcome(null)).currentGameVersionId).toBe("v1");
  });
});
