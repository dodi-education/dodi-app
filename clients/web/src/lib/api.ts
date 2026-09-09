import { DodiClient } from "@dodi/protocol";

import { getAccessToken } from "@/lib/auth/client";

/**
 * Browser API client for the Dodi platform (platform.dodi.app). Pure client: all data
 * goes through the platform HTTP API, authenticated with the user's Better Auth
 * session token as a bearer (no cookies cross to the API origin). `baseUrl` is
 * env-driven (NEXT_PUBLIC_API_URL); empty = same-origin (dev fallback).
 */
export const dodi = new DodiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
  // Resolve `fetch` per call rather than binding the global at import time, so
  // a fetch installed later (test doubles, polyfills) is honored.
  fetch: (input, init) => fetch(input, init),
  auth: {
    kind: "bearer",
    getToken: async () => getAccessToken(),
  },
});
