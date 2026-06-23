import { describe, expect, it } from "vitest";

import { DodiClient } from "./client";
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
