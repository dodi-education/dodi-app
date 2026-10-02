/**
 * Runtime gaps Hermes leaves for the shared core packages. Imported first by
 * the app entry (`index.ts`, package.json "main"), before `expo-router/entry`
 * and so before any route, store or core package touches crypto or the
 * network. Not from the root layout: Expo Router loads route modules before
 * `_layout`, and @noble captures `globalThis.crypto` once, when it loads.
 *
 * - `crypto.getRandomValues`: every @noble primitive draws its randomness
 *   (keys, nonces) from it. expo-crypto backs it with the OS CSPRNG.
 * - `fetch`: the AI SDKs stream their responses (a multi-minute game build is
 *   one long stream). React Native's built-in fetch can't stream; expo/fetch can.
 * - `AbortSignal.timeout`: used by the screenshot-service request.
 * - Intl (PluralRules for ICU plural messages, ListFormat, DisplayNames,
 *   supportedValuesOf): see `intl-polyfills.ts`.
 */
import { getRandomValues } from "expo-crypto";
import { fetch as streamingFetch } from "expo/fetch";

import "./intl-polyfills";

const g = globalThis as unknown as {
  crypto?: { getRandomValues?: typeof getRandomValues };
  fetch: typeof fetch;
};

if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = getRandomValues;
}

g.fetch = streamingFetch as unknown as typeof fetch;

if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("TimeoutError")), ms);
    return controller.signal;
  };
}
