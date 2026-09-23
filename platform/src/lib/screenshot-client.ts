/**
 * Server-to-server client for the screenshot worker (`screenshot/`), the
 * headless browser that renders a game document and returns real frames.
 * Config follows the security-agent convention: both vars set ⇒ enabled, both
 * unset ⇒ the feature is quietly off (self-host default), one ⇒ operator
 * mistake, logged and off. The document is forwarded verbatim and never
 * logged here or anywhere on the platform.
 */

import {
  ScreenshotResponseSchema,
  type ScreenshotRequest,
  type ScreenshotResponse,
} from "@dodi/games/screenshot-contract";

import { logServerError } from "@/lib/error-logs";

/** Worker deadline (20 s) plus queueing headroom. */
const RENDER_TIMEOUT_MS = 30_000;

export interface ScreenshotServiceConfig {
  /** Base URL of the worker, e.g. http://screenshot:3006 (compose network). */
  url: string;
  /** Shared secret, sent as x-screenshot-secret. */
  secret: string;
}

export function loadScreenshotServiceConfig(): ScreenshotServiceConfig | null {
  const url = process.env.SCREENSHOT_SERVICE_URL?.trim() ?? "";
  const secret = process.env.SCREENSHOT_SERVICE_SECRET?.trim() ?? "";
  if (!url && !secret) return null;
  if (!url || !secret) {
    logServerError(
      "lib/screenshot-client#config",
      new Error(
        "screenshot service misconfigured: set both SCREENSHOT_SERVICE_URL and SCREENSHOT_SERVICE_SECRET",
      ),
    );
    return null;
  }
  return { url: url.replace(/\/+$/, ""), secret };
}

/**
 * `status` is the upstream HTTP status, 0 for a network failure or timeout,
 * or 502 for a reply that does not match the contract.
 */
export class ScreenshotServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScreenshotServiceError";
    this.status = status;
  }
}

/** Forward one render request to the worker and return its validated reply. */
export async function renderViaScreenshotService(
  config: ScreenshotServiceConfig,
  request: ScreenshotRequest,
): Promise<ScreenshotResponse> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-screenshot-secret": config.secret,
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ScreenshotServiceError(
      error instanceof Error ? error.message : "screenshot service unreachable",
      0,
    );
  }
  if (!response.ok) {
    throw new ScreenshotServiceError(
      `screenshot service answered ${response.status}`,
      response.status,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  const parsed = ScreenshotResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ScreenshotServiceError("screenshot service returned a malformed reply", 502);
  }
  return parsed.data;
}
