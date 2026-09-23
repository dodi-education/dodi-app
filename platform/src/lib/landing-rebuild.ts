import { logServerError } from "@/lib/error-logs";

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 5_000;

/**
 * Ask the marketing site (dodi-com/landing, a static export) to rebuild after
 * the live published catalogue changed, so its games page picks the change up
 * from GET /api/public/games at build time. Fires the Vercel deploy hook in
 * LANDING_DEPLOY_HOOK_URL; unset (dev, self-hosting) is a no-op. Failures are
 * logged and swallowed so the publication write still succeeds.
 */
export async function triggerLandingRebuild(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = process.env.LANDING_DEPLOY_HOOK_URL;
  if (!url) return;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (response.ok) return;
      lastError = new Error(`deploy hook answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  logServerError("lib/landing-rebuild", lastError, {
    meta: { attempts: MAX_ATTEMPTS },
  });
}
