import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@dodi/types/database";

import { clampText, parseErrorLogSettings, recordErrorLog } from "./error-logs";

// ---------------------------------------------------------------------------
// Minimal fake of the one chain the service uses:
// from("error_logs").insert(payload).select("id").single()
// Queued results are consumed FIFO so the FK-retry path can be exercised.
// ---------------------------------------------------------------------------

interface QueuedResult {
  data: { id: string } | null;
  error: { code: string; message: string } | null;
}

function fakeClient(results: QueuedResult[]) {
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("error_logs");
      return {
        insert: (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve(results.shift()!),
            }),
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, inserts };
}

const ok = (id: string): QueuedResult => ({ data: { id }, error: null });
const fkError: QueuedResult = {
  data: null,
  error: { code: "23503", message: "violates foreign key constraint" },
};

describe("parseErrorLogSettings", () => {
  it("defaults to everything on when unset/empty/all", () => {
    expect(parseErrorLogSettings(undefined)).toEqual({ client: true, server: true });
    expect(parseErrorLogSettings("")).toEqual({ client: true, server: true });
    expect(parseErrorLogSettings("all")).toEqual({ client: true, server: true });
  });

  it("turns everything off for none", () => {
    expect(parseErrorLogSettings("none")).toEqual({ client: false, server: false });
  });

  it("supports single types and comma lists (case/space tolerant)", () => {
    expect(parseErrorLogSettings("client")).toEqual({ client: true, server: false });
    expect(parseErrorLogSettings("Server")).toEqual({ client: false, server: true });
    expect(parseErrorLogSettings(" client , server ")).toEqual({
      client: true,
      server: true,
    });
  });
});

describe("clampText", () => {
  it("passes short values and nulls through", () => {
    expect(clampText("boom", 10)).toBe("boom");
    expect(clampText(null, 10)).toBeNull();
    expect(clampText(undefined, 10)).toBeNull();
    expect(clampText("", 10)).toBeNull();
  });

  it("truncates long values with an ellipsis", () => {
    expect(clampText("a".repeat(20), 10)).toBe(`${"a".repeat(10)}…`);
  });
});

describe("recordErrorLog", () => {
  it("persists the type and collapses missing fields to null", async () => {
    const { client, inserts } = fakeClient([ok("e1")]);
    const result = await recordErrorLog(client, {
      accountId: "acc-1",
      type: "client",
      context: "game_build",
      provider: "anthropic",
      errorName: "APIConnectionError",
    });

    expect(result.id).toBe("e1");
    expect(inserts[0]).toMatchObject({
      account_id: "acc-1",
      type: "client",
      context: "game_build",
      provider: "anthropic",
      error_name: "APIConnectionError",
      kid_id: null,
      game_id: null,
      model: null,
      error_message: null,
      http_status: null,
      meta: null,
      user_agent: null,
    });
  });

  it("allows account-less server errors", async () => {
    const { client, inserts } = fakeClient([ok("e2")]);
    await recordErrorLog(client, {
      type: "server",
      context: "api/games#POST",
      errorName: "Error",
      errorMessage: "boom",
      httpStatus: 500,
    });
    expect(inserts[0]).toMatchObject({
      account_id: null,
      type: "server",
      context: "api/games#POST",
      http_status: 500,
    });
  });

  it("retries without kid/game attribution when the insert fails", async () => {
    const { client, inserts } = fakeClient([fkError, ok("e3")]);
    const result = await recordErrorLog(client, {
      accountId: "acc-1",
      kidId: "kid-gone",
      gameId: "game-gone",
      type: "client",
      context: "game_update",
    });

    expect(result.id).toBe("e3");
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({ kid_id: "kid-gone", game_id: "game-gone" });
    expect(inserts[1]).toMatchObject({ kid_id: null, game_id: null });
  });

  it("throws when the un-attributed insert fails too", async () => {
    const { client } = fakeClient([fkError]);
    await expect(
      recordErrorLog(client, { type: "client", context: "game_build" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("foreign key") });
  });
});
