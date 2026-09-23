import { NextResponse } from "next/server";

import {
  SCREENSHOT_LIMITS,
  ScreenshotRequestSchema,
} from "@dodi/games/screenshot-contract";

import { serviceDb } from "@/lib/db";
import { logServerError, serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  loadScreenshotServiceConfig,
  renderViaScreenshotService,
  ScreenshotServiceError,
} from "@/lib/screenshot-client";
import { gameScreenshotServiceOf, getAccount } from "@/services/accounts";
import { consumeRateLimit } from "@/services/rate-limits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Renders per account per hour. A build spends at most three (two model-driven
 * view_game calls plus the forced check), so this is abuse headroom, not a
 * ceiling a parent can reach by building games.
 */
export const SCREENSHOT_RATE_LIMIT = {
  bucket: "game_screenshot",
  limit: 60,
  windowMs: 3_600_000,
} as const;

/** Document cap plus JSON envelope headroom, checked before the body is buffered. */
const MAX_BODY_BYTES = SCREENSHOT_LIMITS.MAX_DOCUMENT_BYTES + 64_000;

/**
 * User-authed proxy to the screenshot worker: the studio posts the finished
 * sandbox document of a game being built and gets real frames back for the
 * agent to look at. The document is plaintext game code, which games-are-E2EE
 * otherwise keeps off the server, so this route exists only for accounts that
 * chose the dodi screenshot service, and it stores and logs nothing of the
 * document: it forwards, answers, and forgets.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Document too large" }, { status: 413 });
  }

  // The parent's choice is enforced here, not only in the client: a buggy or
  // hostile client cannot make the platform render for an account that opted
  // out (or that points at its own service).
  const account = await getAccount(db, accountId);
  if (!account || gameScreenshotServiceOf(account).mode !== "dodi") {
    return NextResponse.json(
      { error: "screenshot_service_not_enabled" },
      { status: 403 },
    );
  }

  const config = loadScreenshotServiceConfig();
  if (!config) {
    return NextResponse.json(
      { error: "screenshot_service_unavailable" },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = ScreenshotRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const limit = await consumeRateLimit(serviceDb, { accountId, ...SCREENSHOT_RATE_LIMIT });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAt: limit.resetAt.toISOString() },
      { status: 429 },
    );
  }

  const startedAt = Date.now();
  try {
    const result = await renderViaScreenshotService(config, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    // Telemetry carries sizes, timing and status. Never the document.
    const meta = {
      documentBytes: parsed.data.document.length,
      steps: parsed.data.steps?.length ?? 0,
      durationMs: Date.now() - startedAt,
    };
    if (error instanceof ScreenshotServiceError) {
      // Pass through what the client can act on (busy, timed out); everything
      // else the worker did is a bad gateway from the client's point of view.
      const status =
        error.status === 429 || error.status === 504
          ? error.status
          : error.status === 0
            ? 504
            : 502;
      logServerError("api/games/screenshot#POST", error, { accountId, httpStatus: status, meta });
      return NextResponse.json({ error: "screenshot_service_failed" }, { status });
    }
    return serverErrorResponse(error, "Screenshot failed", "api/games/screenshot#POST", {
      accountId,
      meta,
      expose: false,
    });
  }
}
