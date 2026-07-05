import { afterEach, describe, expect, it } from "vitest";

import { clientIp, hashIp } from "./client-ip";

function req(headers: Record<string, string>): Request {
  return new Request("https://api.dodi.app/api/newsletter", { headers });
}

describe("clientIp", () => {
  it("takes the leftmost x-forwarded-for entry (the real client)", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" }))).toBe(
      "1.2.3.4",
    );
  });

  it("trims whitespace", () => {
    expect(clientIp(req({ "x-forwarded-for": "  1.2.3.4  " }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("returns null when no ip header is present", () => {
    expect(clientIp(req({}))).toBeNull();
  });
});

describe("hashIp", () => {
  const original = process.env.NEWSLETTER_IP_HASH_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.NEWSLETTER_IP_HASH_SECRET;
    else process.env.NEWSLETTER_IP_HASH_SECRET = original;
  });

  it("returns null for a null ip", () => {
    process.env.NEWSLETTER_IP_HASH_SECRET = "pepper";
    expect(hashIp(null)).toBeNull();
  });

  it("returns null when the secret is unset (per-IP limit skipped)", () => {
    delete process.env.NEWSLETTER_IP_HASH_SECRET;
    expect(hashIp("1.2.3.4")).toBeNull();
  });

  it("is deterministic and does not leak the raw ip", () => {
    process.env.NEWSLETTER_IP_HASH_SECRET = "pepper";
    const h = hashIp("1.2.3.4");
    expect(h).toBe(hashIp("1.2.3.4"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("1.2.3.4");
  });

  it("changes with the pepper", () => {
    process.env.NEWSLETTER_IP_HASH_SECRET = "pepper-a";
    const a = hashIp("1.2.3.4");
    process.env.NEWSLETTER_IP_HASH_SECRET = "pepper-b";
    expect(hashIp("1.2.3.4")).not.toBe(a);
  });
});
