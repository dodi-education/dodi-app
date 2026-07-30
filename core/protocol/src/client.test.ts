import { describe, expect, it } from "vitest";

import { DodiClient, NpubConflictError } from "./client";
import { PutVaultKeysBodySchema } from "./schemas";
import type { StoredVaultKeys } from "@dodi/vault";

/**
 * Browser `fetch` brand-checks its receiver and throws "Illegal invocation" when
 * called with `this` other than the global object. Node's fetch doesn't enforce
 * that, so we wrap a mock to simulate the browser and lock the binding: the
 * client must never call fetch as a method on itself.
 */
function strictGlobalFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = function (
    this: unknown,
    input: string,
    init?: RequestInit,
  ): Promise<Response> {
    if (this !== globalThis) {
      throw new TypeError(
        "Failed to execute 'fetch' on 'Window': Illegal invocation",
      );
    }
    calls.push({ url: input, init });
    return Promise.resolve(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  } as unknown as typeof fetch;
  return { fn, calls };
}

const EMPTY_KEYS = {
  deviceWraps: [],
  passwordWrap: null,
  vmkCheck: "x",
} as unknown as StoredVaultKeys;

describe("DodiClient fetch binding", () => {
  it("calls fetch bound to the global object (cookie auth)", async () => {
    const { fn, calls } = strictGlobalFetch();
    const client = new DodiClient({
      baseUrl: "https://api.example",
      fetch: fn,
      auth: { kind: "cookie" },
    });

    await expect(client.request("/api/health")).resolves.toBeInstanceOf(
      Response,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example/api/health");
  });

  it("works on the bearer putVaultKeys path (the register flow)", async () => {
    const { fn } = strictGlobalFetch();
    const client = new DodiClient({
      baseUrl: "https://api.example",
      fetch: fn,
      auth: { kind: "bearer", getToken: () => "tok" },
    });

    await expect(client.putVaultKeys(EMPTY_KEYS)).resolves.toBeUndefined();
  });
});

const NPUB_HEX = "ab".repeat(32);

describe("putVaultKeys npub bind", () => {
  it("serializes npub flat into the body only when provided", async () => {
    const { fn, calls } = strictGlobalFetch();
    const client = new DodiClient({ fetch: fn });

    await client.putVaultKeys(EMPTY_KEYS);
    await client.putVaultKeys(EMPTY_KEYS, { npub: NPUB_HEX });

    expect(JSON.parse(calls[0].init?.body as string)).not.toHaveProperty("npub");
    expect(JSON.parse(calls[1].init?.body as string)).toMatchObject({
      vmkCheck: "x",
      npub: NPUB_HEX,
    });
  });

  it("throws NpubConflictError on 409", async () => {
    const fn = (() =>
      Promise.resolve(
        new Response('{"error":"npub-conflict"}', { status: 409 }),
      )) as unknown as typeof fetch;
    const client = new DodiClient({ fetch: fn });

    await expect(
      client.putVaultKeys(EMPTY_KEYS, { npub: NPUB_HEX }),
    ).rejects.toBeInstanceOf(NpubConflictError);
  });
});

describe("PutVaultKeysBodySchema npub format", () => {
  const base = { deviceWraps: [], passwordWrap: null, vmkCheck: "x" };

  it("accepts lowercase hex and absence", () => {
    expect(PutVaultKeysBodySchema.safeParse(base).success).toBe(true);
    expect(
      PutVaultKeysBodySchema.safeParse({ ...base, npub: NPUB_HEX }).success,
    ).toBe(true);
  });

  it("rejects bech32, uppercase hex, and wrong lengths", () => {
    for (const npub of [
      "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
      NPUB_HEX.toUpperCase(),
      NPUB_HEX.slice(0, -2),
      "",
    ]) {
      expect(
        PutVaultKeysBodySchema.safeParse({ ...base, npub }).success,
      ).toBe(false);
    }
  });
});
