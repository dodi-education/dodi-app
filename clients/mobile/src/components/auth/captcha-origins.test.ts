import { describe, expect, it, vi } from "vitest";

import { CAPTCHA_ORIGIN_WHITELIST } from "./captcha-origins";

// react-native-webview's real navigation filter, run from its TypeScript
// source (the compiled lib `require`s react-native past vi.mock). The
// specifier is a variable so tsc doesn't type-check the library's source;
// the types come from its published declarations.
vi.mock("react-native", () => ({
  Linking: { canOpenURL: () => Promise.resolve(false), openURL: () => Promise.resolve() },
  View: () => null,
  ActivityIndicator: () => null,
  Text: () => null,
  Platform: { OS: "ios", select: (options: { ios?: unknown }) => options.ios },
  StyleSheet: { create: <T>(styles: T): T => styles },
}));

const WEBVIEW_SHARED = "react-native-webview/src/WebViewShared";
const { createOnShouldStartLoadWithRequest } = (await import(
  /* @vite-ignore */ WEBVIEW_SHARED
)) as typeof import("react-native-webview/lib/WebViewShared");

/** Whether the captcha WebView loads `url` in place (true) or cancels it. */
function isLoadedInPlace(url: string): boolean {
  const loadRequest = vi.fn();
  const onShouldStart = createOnShouldStartLoadWithRequest(loadRequest, CAPTCHA_ORIGIN_WHITELIST);
  onShouldStart({ nativeEvent: { url, lockIdentifier: 1 } } as Parameters<typeof onShouldStart>[0]);
  return loadRequest.mock.calls[0]?.[0] === true;
}

describe("captcha WebView navigation", () => {
  it("loads Turnstile's challenge frame (about:srcdoc) in place", () => {
    expect(isLoadedInPlace("about:srcdoc")).toBe(true);
  });

  it("loads Cloudflare's challenge pages in place", () => {
    expect(
      isLoadedInPlace("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2"),
    ).toBe(true);
  });

  it("still cancels navigations to app schemes", () => {
    expect(isLoadedInPlace("dodi://login")).toBe(false);
  });

  it("admits no other about: page than srcdoc and blank", () => {
    expect(isLoadedInPlace("about:src")).toBe(false);
    expect(isLoadedInPlace("about:settings")).toBe(false);
  });
});
