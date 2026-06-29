import { describe, expect, it } from "vitest";

import { canonicalRedirectHost, isMarketingRoute } from "./canonical-host";

const APP_URL = "https://app.dodi.app";

describe("isMarketingRoute", () => {
  it("treats the root as marketing", () => {
    expect(isMarketingRoute("/")).toBe(true);
  });

  it("treats app-logic routes as non-marketing", () => {
    expect(isMarketingRoute("/login")).toBe(false);
    expect(isMarketingRoute("/parent/dashboard")).toBe(false);
  });
});

describe("canonicalRedirectHost", () => {
  it("redirects app-logic routes from www to the app host", () => {
    expect(canonicalRedirectHost("/login", "www.dodi.app", APP_URL)).toBe(
      "app.dodi.app",
    );
  });

  it("redirects app-logic routes from the bare apex to the app host", () => {
    expect(canonicalRedirectHost("/login", "dodi.app", APP_URL)).toBe(
      "app.dodi.app",
    );
  });

  it("does not redirect when already on the app host", () => {
    expect(canonicalRedirectHost("/login", "app.dodi.app", APP_URL)).toBeNull();
  });

  it("never redirects the marketing landing", () => {
    expect(canonicalRedirectHost("/", "www.dodi.app", APP_URL)).toBeNull();
  });

  it("leaves preview hosts on other domains untouched", () => {
    expect(
      canonicalRedirectHost("/login", "dodi-web-abc.vercel.app", APP_URL),
    ).toBeNull();
  });

  it("leaves LAN-IP dev hosts untouched", () => {
    expect(
      canonicalRedirectHost(
        "/login",
        "192.168.1.23:3000",
        "https://192.168.1.23:3000",
      ),
    ).toBeNull();
  });

  it("leaves localhost dev hosts untouched", () => {
    expect(
      canonicalRedirectHost("/login", "localhost:3000", "https://localhost:3000"),
    ).toBeNull();
  });

  it("ignores the request port when comparing hosts", () => {
    expect(canonicalRedirectHost("/login", "www.dodi.app:443", APP_URL)).toBe(
      "app.dodi.app",
    );
  });

  it("returns null when no app URL is configured", () => {
    expect(canonicalRedirectHost("/login", "www.dodi.app", undefined)).toBeNull();
  });
});
