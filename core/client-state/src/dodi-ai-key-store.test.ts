import { afterEach, describe, expect, it, vi } from "vitest";

import type { DodiAIClient } from "./dodi-ai";
import { createDodiAIKeyStore, KEY_MAX_AGE_MS, KEY_MIN_REMAINING_MS } from "./dodi-ai-key-store";

function clientReturning(...bodies: unknown[]): DodiAIClient & { request: ReturnType<typeof vi.fn> } {
  const request = vi.fn();
  for (const body of bodies) {
    request.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  }
  return { isConfigured: () => true, request };
}

const xaiKey = { provider: "xai", apiKey: "xai-secret", providerKeyId: "x1", mintedAt: "t" };

describe("dodi AI key store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops keys for providers this client doesn't know instead of failing the bundle", async () => {
    const client = clientReturning({
      keys: [xaiKey, { provider: "future-ai", apiKey: "f", providerKeyId: "f1", mintedAt: "t" }],
    });
    const store = createDodiAIKeyStore(client);
    const keys = await store.getState().load();
    expect(keys).toHaveLength(1);
    expect(store.getState().status).toBe("active");
    expect(store.getState().getKey("xai")).toBe("xai-secret");
  });

  it("ensureFresh refetches when a held key expires within the freshness window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    const soon = new Date(Date.now() + KEY_MIN_REMAINING_MS - 60_000).toISOString();
    const later = new Date(Date.now() + 20 * 3_600_000).toISOString();
    const client = clientReturning(
      { keys: [xaiKey, { provider: "venice", apiKey: "old", providerKeyId: "v1", mintedAt: "t", expiresAt: soon }] },
      { keys: [xaiKey, { provider: "venice", apiKey: "new", providerKeyId: "v2", mintedAt: "t", expiresAt: later }] },
    );
    const store = createDodiAIKeyStore(client);
    await store.getState().load();
    await store.getState().ensureFresh();
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(store.getState().getKey("venice")).toBe("new");
  });

  it("ensureFresh reuses keys that stay valid long enough", async () => {
    const later = new Date(Date.now() + 20 * 3_600_000).toISOString();
    const client = clientReturning({
      keys: [{ provider: "venice", apiKey: "v", providerKeyId: "v1", mintedAt: "t", expiresAt: later }],
    });
    const store = createDodiAIKeyStore(client);
    await store.getState().ensureFresh();
    await store.getState().ensureFresh();
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("ensureFresh refetches keys without expiry once they are older than the max age", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T02:50:00Z"));
    const client = clientReturning(
      { keys: [xaiKey] },
      { keys: [{ ...xaiKey, apiKey: "xai-rotated" }] },
    );
    const store = createDodiAIKeyStore(client);
    await store.getState().ensureFresh();
    vi.setSystemTime(Date.now() + KEY_MAX_AGE_MS - 1000);
    await store.getState().ensureFresh();
    expect(client.request).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2000);
    await store.getState().ensureFresh();
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(store.getState().getKey("xai")).toBe("xai-rotated");
  });
});
