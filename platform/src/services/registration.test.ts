import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@dodi/types/database";

import { getRegistrationMode, isInviteCodeActive } from "./registration";

describe("getRegistrationMode", () => {
  const original = process.env.REGISTRATION_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.REGISTRATION_MODE;
    else process.env.REGISTRATION_MODE = original;
  });

  it("defaults to open when unset", () => {
    delete process.env.REGISTRATION_MODE;
    expect(getRegistrationMode()).toBe("open");
  });

  it("defaults to open for invalid values", () => {
    process.env.REGISTRATION_MODE = "banana";
    expect(getRegistrationMode()).toBe("open");
  });

  it.each(["open", "invite", "closed"] as const)("accepts %s", (mode) => {
    process.env.REGISTRATION_MODE = mode;
    expect(getRegistrationMode()).toBe(mode);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.REGISTRATION_MODE = "  INVITE ";
    expect(getRegistrationMode()).toBe("invite");
  });
});

describe("isInviteCodeActive", () => {
  function fakeClient(result: {
    data?: unknown;
    error?: { message: string } | null;
  }): { client: SupabaseClient<Database>; rpc: ReturnType<typeof vi.fn> } {
    const rpc = vi.fn().mockResolvedValue(result);
    return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
  }

  it("returns false for blank codes without touching the db", async () => {
    const { client, rpc } = fakeClient({ data: true });
    expect(await isInviteCodeActive(client, "   ")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the trimmed code to the rpc and returns its boolean", async () => {
    const { client, rpc } = fakeClient({ data: true });
    expect(await isInviteCodeActive(client, "  DODI-BETA ")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_invite_code_active", {
      p_code: "DODI-BETA",
    });
  });

  it("returns false when the rpc reports inactive", async () => {
    const { client } = fakeClient({ data: false });
    expect(await isInviteCodeActive(client, "NOPE")).toBe(false);
  });

  it("throws when the rpc errors", async () => {
    const { client } = fakeClient({ error: { message: "boom" } });
    await expect(isInviteCodeActive(client, "X")).rejects.toThrow("boom");
  });
});
