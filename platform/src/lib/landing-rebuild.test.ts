import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logServerError } from "@/lib/error-logs";

import { triggerLandingRebuild } from "./landing-rebuild";

vi.mock("@/lib/error-logs", () => ({
  logServerError: vi.fn(),
}));

const HOOK_URL = "https://api.vercel.com/v1/integrations/deploy/test";

describe("triggerLandingRebuild", () => {
  beforeEach(() => {
    vi.mocked(logServerError).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op without LANDING_DEPLOY_HOOK_URL", async () => {
    vi.stubEnv("LANDING_DEPLOY_HOOK_URL", "");
    const fetchImpl = vi.fn<typeof fetch>();
    await triggerLandingRebuild(fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs the deploy hook once when it answers ok", async () => {
    vi.stubEnv("LANDING_DEPLOY_HOOK_URL", HOOK_URL);
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("{}", { status: 201 }));
    await triggerLandingRebuild(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(HOOK_URL);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it("retries, then logs and swallows the failure", async () => {
    vi.stubEnv("LANDING_DEPLOY_HOOK_URL", HOOK_URL);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(new Response("", { status: 500 }));
    await expect(triggerLandingRebuild(fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(logServerError).toHaveBeenCalledWith(
      "lib/landing-rebuild",
      expect.objectContaining({ message: "deploy hook answered 500" }),
      { meta: { attempts: 3 } },
    );
  });
});
