import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api", () => ({ dodi: { request } }));

import { useCaptchaStore } from "./captcha-store";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("captcha-store", () => {
  beforeEach(() => {
    request.mockReset();
    useCaptchaStore.getState().reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the Turnstile config once and shares it across concurrent callers", async () => {
    request.mockResolvedValue(
      json({
        provider: "cloudflare-turnstile",
        siteKey: "1x00000000000000000000AA",
      }),
    );
    const { load } = useCaptchaStore.getState();
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toEqual({
      provider: "cloudflare-turnstile",
      siteKey: "1x00000000000000000000AA",
    });
    expect(b).toBe(a);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/auth/captcha-config");

    await load();
    expect(request).toHaveBeenCalledTimes(1);
    expect(useCaptchaStore.getState().config).toEqual(a);
  });

  it("reports captcha off when the platform says so, and caches that too", async () => {
    request.mockResolvedValue(json({ provider: null }));
    expect(await useCaptchaStore.getState().load()).toEqual({ provider: null });
    await useCaptchaStore.getState().load();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("treats an unknown provider or missing site key as off", async () => {
    request.mockResolvedValue(json({ provider: "cloudflare-turnstile" }));
    expect(await useCaptchaStore.getState().load()).toEqual({ provider: null });
  });

  it("answers off WITHOUT caching when the platform is unreachable, then retries", async () => {
    request.mockRejectedValueOnce(new Error("offline"));
    expect(await useCaptchaStore.getState().load()).toEqual({ provider: null });
    expect(useCaptchaStore.getState().config).toBeNull();

    request.mockResolvedValue(
      json({ provider: "cloudflare-turnstile", siteKey: "k" }),
    );
    expect(await useCaptchaStore.getState().load()).toEqual({
      provider: "cloudflare-turnstile",
      siteKey: "k",
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("answers off without caching on a non-2xx status", async () => {
    request.mockResolvedValueOnce(json({ error: "boom" }, 500));
    expect(await useCaptchaStore.getState().load()).toEqual({ provider: null });
    expect(useCaptchaStore.getState().config).toBeNull();
  });
});
