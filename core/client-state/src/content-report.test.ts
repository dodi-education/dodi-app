import { describe, expect, it, vi } from "vitest";

import { reportDraftFromQuery, submitContentReport } from "./content-report";

function api(response: Response | Error) {
  return {
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  };
}

const KID = "5b6f0a53-7f0a-4b53-9a53-000000000001";
const GAME = "5b6f0a53-7f0a-4b53-9a53-000000000002";

describe("reportDraftFromQuery", () => {
  it("starts a companion report by default", () => {
    expect(reportDraftFromQuery({})).toEqual({
      contentKind: "companion_answer",
      reason: "",
      details: "",
      kidId: null,
      gameId: null,
    });
  });

  it("takes the kind and game from a Discover entry point", () => {
    expect(reportDraftFromQuery({ kind: "discover_game", game: GAME })).toMatchObject({
      contentKind: "discover_game",
      gameId: GAME,
    });
  });

  it("treats a game without a known kind as a library game", () => {
    expect(reportDraftFromQuery({ kind: "persona", game: GAME }).contentKind).toBe("game");
  });
});

describe("submitContentReport", () => {
  it("posts the trimmed report", async () => {
    const platform = api(new Response("{}", { status: 201 }));

    await expect(
      submitContentReport(
        { api: platform },
        { contentKind: "discover_game", reason: "inappropriate", details: "  too scary  ", kidId: KID, gameId: GAME },
        "web",
      ),
    ).resolves.toEqual({ kind: "sent" });
    expect(platform.request).toHaveBeenCalledWith("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentKind: "discover_game",
        reason: "inappropriate",
        details: "too scary",
        kidId: KID,
        gameId: GAME,
        clientPlatform: "web",
      }),
    });
  });

  it("drops the game from a companion report and empty details", async () => {
    const platform = api(new Response("{}", { status: 201 }));

    await submitContentReport(
      { api: platform },
      { contentKind: "companion_answer", reason: "wrong", details: "  ", kidId: null, gameId: GAME },
      "mobile",
    );

    const body = JSON.parse((platform.request.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toEqual({ contentKind: "companion_answer", reason: "wrong", clientPlatform: "mobile" });
  });

  it("asks for a reason first and maps failures", async () => {
    const draft = { contentKind: "game" as const, reason: "" as const, details: "", kidId: null, gameId: null };
    await expect(submitContentReport({ api: api(new Response()) }, draft, "web")).resolves.toEqual({
      kind: "error",
      key: "reasonRequired",
    });

    const filled = { ...draft, reason: "other" as const };
    await expect(
      submitContentReport({ api: api(new Response("{}", { status: 429 })) }, filled, "web"),
    ).resolves.toEqual({ kind: "error", key: "rateLimited" });
    await expect(
      submitContentReport({ api: api(new Response("{}", { status: 500 })) }, filled, "web"),
    ).resolves.toEqual({ kind: "error", key: "failed" });
    await expect(submitContentReport({ api: api(new Error("offline")) }, filled, "web")).resolves.toEqual({
      kind: "error",
      key: "failed",
    });
  });
});
