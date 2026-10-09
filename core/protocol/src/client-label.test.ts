import { describe, expect, it } from "vitest";

import { appClientLabel, clientLabelFromUserAgent } from "./client-label";

describe("client labels", () => {
  it.each([
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox on Linux"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Safari on macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0", "Edge on Windows"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36", "Chrome on Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari on iOS"],
  ])("labels %s", (ua, label) => {
    expect(clientLabelFromUserAgent(ua)).toBe(label);
  });

  it("never carries versions or models", () => {
    const label = clientLabelFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129.0 Mobile Safari/537.36");
    expect(label).not.toMatch(/\d|Pixel/);
  });

  it("is null for nothing recognisable", () => {
    expect(clientLabelFromUserAgent("curl/8.0")).toBeNull();
    expect(clientLabelFromUserAgent(null)).toBeNull();
  });

  it("labels the app by OS", () => {
    expect(appClientLabel("ios")).toBe("dodi app on iOS");
  });
});
