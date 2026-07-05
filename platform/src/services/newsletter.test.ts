import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@dodi/types/database";

import {
  getNewsletterLists,
  isValidNewsletterList,
  recordNewsletterSignup,
} from "./newsletter";

describe("getNewsletterLists", () => {
  const original = process.env.NEWSLETTER_LISTS;
  afterEach(() => {
    if (original === undefined) delete process.env.NEWSLETTER_LISTS;
    else process.env.NEWSLETTER_LISTS = original;
  });

  it("falls back to the default newsletter list when unset", () => {
    delete process.env.NEWSLETTER_LISTS;
    expect(getNewsletterLists()).toEqual(["newsletter"]);
  });

  it("parses a comma-separated list, trimming and dropping blanks", () => {
    process.env.NEWSLETTER_LISTS = " newsletter , product-updates ,,";
    expect(getNewsletterLists()).toEqual([
      "newsletter",
      "product-updates",
    ]);
  });

  it("validates membership", () => {
    process.env.NEWSLETTER_LISTS = "newsletter,product-updates";
    expect(isValidNewsletterList("product-updates")).toBe(true);
    expect(isValidNewsletterList("nope")).toBe(false);
  });
});

function fakeClient(result: {
  data?: unknown;
  error?: { message: string } | null;
}): { client: SupabaseClient<Database>; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const base = {
  email: "kid@example.com",
  locale: "en" as const,
  list: "newsletter",
  ipHash: "abc123",
  maxPerIp: 5,
  window: "01:00:00",
};

describe("recordNewsletterSignup", () => {
  it("forwards the submission to the rpc with the right arg names", async () => {
    const { client, rpc } = fakeClient({
      data: [{ id: "id-1", is_new: true, rate_limited: false }],
    });
    await recordNewsletterSignup(client, base);
    expect(rpc).toHaveBeenCalledWith("record_newsletter_signup", {
      p_email: "kid@example.com",
      p_locale: "en",
      p_list: "newsletter",
      p_ip_hash: "abc123",
      p_max_per_ip: 5,
      p_window: "01:00:00",
    });
  });

  it("maps a new-row result", async () => {
    const { client } = fakeClient({
      data: [{ id: "id-1", is_new: true, rate_limited: false }],
    });
    expect(await recordNewsletterSignup(client, base)).toEqual({
      id: "id-1",
      isNew: true,
      rateLimited: false,
    });
  });

  it("maps a deduped (existing) result", async () => {
    const { client } = fakeClient({
      data: [{ id: "id-1", is_new: false, rate_limited: false }],
    });
    expect(await recordNewsletterSignup(client, base)).toMatchObject({
      isNew: false,
      rateLimited: false,
    });
  });

  it("maps a rate-limited result", async () => {
    const { client } = fakeClient({
      data: [{ id: null, is_new: false, rate_limited: true }],
    });
    expect(await recordNewsletterSignup(client, base)).toEqual({
      id: null,
      isNew: false,
      rateLimited: true,
    });
  });

  it("throws when the rpc errors", async () => {
    const { client } = fakeClient({ error: { message: "boom" } });
    await expect(recordNewsletterSignup(client, base)).rejects.toThrow("boom");
  });

  it("throws when the rpc returns no row", async () => {
    const { client } = fakeClient({ data: [] });
    await expect(recordNewsletterSignup(client, base)).rejects.toThrow("no row");
  });
});
