import { describe, expect, it } from "vitest";

import { canonicalRedirectHost } from "./canonical-host";

const APP_URL = "https://app.dodi.app";

describe("canonicalRedirectHost", () => {
  it("redirects app routes from www to the app host", () => {
    expect(canonicalRedirectHost("www.dodi.app", APP_URL)).toBe("app.dodi.app");
  });

  it("redirects app routes from the bare apex to the app host", () => {
    expect(canonicalRedirectHost("dodi.app", APP_URL)).toBe("app.dodi.app");
  });

  it("does not redirect when already on the app host", () => {
    expect(canonicalRedirectHost("app.dodi.app", APP_URL)).toBeNull();
  });

  it("leaves preview hosts on other domains untouched", () => {
    expect(canonicalRedirectHost("dodi-web-abc.vercel.app", APP_URL)).toBeNull();
  });

  it("leaves LAN-IP dev hosts untouched", () => {
    expect(
      canonicalRedirectHost("192.168.1.23:3000", "https://192.168.1.23:3000"),
    ).toBeNull();
  });

  it("leaves localhost dev hosts untouched (served directly, no cross-host bounce)", () => {
    expect(
      canonicalRedirectHost("localhost:3000", "https://localhost:3000"),
    ).toBeNull();
  });

  it("ignores the request port when comparing hosts", () => {
    expect(canonicalRedirectHost("www.dodi.app:443", APP_URL)).toBe(
      "app.dodi.app",
    );
  });

  it("returns null when no app URL is configured", () => {
    expect(canonicalRedirectHost("www.dodi.app", undefined)).toBeNull();
  });
});
