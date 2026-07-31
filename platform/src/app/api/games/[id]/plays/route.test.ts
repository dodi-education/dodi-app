import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The offline-sync POST contract: client-supplied play ids are idempotency
 * keys. A replay of an own play answers 200 with the same id; a foreign id
 * (RLS-hidden row → pkey violation, or a visible foreign row) answers 409;
 * an implausible startedAt answers 400 before touching the DB.
 */

const { getKidMock, getPlayableGameMock, visibleMock, startPlayMock, getPlayMock } =
  vi.hoisted(() => ({
    getKidMock: vi.fn(),
    getPlayableGameMock: vi.fn(),
    visibleMock: vi.fn(),
    startPlayMock: vi.fn(),
    getPlayMock: vi.fn(),
  }));

vi.mock("@/lib/resolve-auth", () => ({
  requireAuth: vi.fn(async () => ({ accountId: "acc-1", supabase: {} })),
}));
vi.mock("@/lib/supabase", () => ({ serviceClient: () => ({}) }));
vi.mock("@/lib/error-logs", () => ({
  serverErrorResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "server" }), { status: 500 }),
  ),
}));
vi.mock("@/services/kids", () => ({ getKid: getKidMock }));
vi.mock("@/services/games", () => ({
  getPlayableGame: getPlayableGameMock,
  isGameVisibleToKid: visibleMock,
}));
vi.mock("@/services/game-plays", () => ({
  startPlay: startPlayMock,
  getPlay: getPlayMock,
}));

import { POST } from "./route";

const KID = "5b6f0a53-7f0a-4b53-9a53-000000000001";
const PLAY = "5b6f0a53-7f0a-4b53-9a53-000000000002";
const GAME = "game-1";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://platform.test/api/games/game-1/plays", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: GAME }) };

describe("POST /api/games/[id]/plays", () => {
  beforeEach(() => {
    getKidMock.mockReset().mockResolvedValue({ id: KID, account_id: "acc-1" });
    getPlayableGameMock
      .mockReset()
      .mockResolvedValue({ id: GAME, progress_kind: "goal" });
    visibleMock.mockReset().mockResolvedValue(true);
    getPlayMock.mockReset().mockResolvedValue(null);
    startPlayMock.mockReset().mockResolvedValue({ id: PLAY });
  });

  it("starts a plain play without client id (online path)", async () => {
    const res = await POST(makeRequest({ kidId: KID }), context);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ playId: PLAY });
    expect(startPlayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ playId: undefined, startedAt: undefined }),
    );
    expect(getPlayMock).not.toHaveBeenCalled();
  });

  it("passes a client play id + startedAt through to the insert", async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const res = await POST(
      makeRequest({ kidId: KID, playId: PLAY, startedAt }),
      context,
    );
    expect(res.status).toBe(201);
    expect(startPlayMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ playId: PLAY, startedAt }),
    );
  });

  it("rejects an implausible startedAt before touching the DB", async () => {
    const res = await POST(
      makeRequest({
        kidId: KID,
        playId: PLAY,
        startedAt: "2020-01-01T00:00:00Z",
      }),
      context,
    );
    expect(res.status).toBe(400);
    expect(startPlayMock).not.toHaveBeenCalled();
  });

  it("answers an own-play replay with 200 and the same id", async () => {
    getPlayMock.mockResolvedValue({
      id: PLAY,
      account_id: "acc-1",
      game_id: GAME,
      kid_id: KID,
    });
    const res = await POST(makeRequest({ kidId: KID, playId: PLAY }), context);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ playId: PLAY });
    expect(startPlayMock).not.toHaveBeenCalled();
  });

  it("answers 409 for a visible foreign play id", async () => {
    getPlayMock.mockResolvedValue({
      id: PLAY,
      account_id: "acc-2",
      game_id: GAME,
      kid_id: KID,
    });
    const res = await POST(makeRequest({ kidId: KID, playId: PLAY }), context);
    expect(res.status).toBe(409);
  });

  it("maps an RLS-hidden pkey collision (23505) to 409", async () => {
    startPlayMock.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );
    const res = await POST(makeRequest({ kidId: KID, playId: PLAY }), context);
    expect(res.status).toBe(409);
  });
});
