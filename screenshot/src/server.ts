/**
 * The worker's HTTP surface: POST /render (the screenshot contract) and
 * GET /healthz. Plain node:http, no framework.
 *
 * Auth is a shared secret in `x-screenshot-secret` (constant-time compare);
 * unset means open, for private networks. Browsers may call /render directly
 * in the app's custom-service mode, so CORS is granted to the configured
 * origins only. Bodies are capped before they are buffered. The log line per
 * request carries method, status, timing and sizes, never the document.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { SCREENSHOT_LIMITS, ScreenshotRequestSchema } from "@dodi/games/screenshot-contract";

import type { WorkerConfig } from "./config";
import { RenderBusyError, RenderTimeoutError, type Renderer } from "./renderer";

/** Document cap plus JSON envelope headroom. */
export const MAX_BODY_BYTES = SCREENSHOT_LIMITS.MAX_DOCUMENT_BYTES + 64_000;

export interface ServerDeps {
  renderer: Pick<Renderer, "render">;
  config: WorkerConfig;
  /** NDJSON sink; defaults to stdout. */
  log?: (line: Record<string, unknown>) => void;
}

function secretMatches(provided: string | undefined, expected: string): boolean {
  const a = createHash("sha256").update(provided ?? "").digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function corsHeaders(origin: string | undefined, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-screenshot-secret",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(json);
}

/** Buffer the body up to the cap; null when it is larger. */
function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createServer({ renderer, config, log }: ServerDeps): Server {
  const emit = log ?? ((line) => console.log(JSON.stringify(line)));

  return createHttpServer(async (req, res) => {
    const startedAt = Date.now();
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = req.headers.origin;
    const cors = corsHeaders(origin, config.allowedOrigins);
    const finish = (status: number, extra: Record<string, unknown> = {}): void => {
      emit({
        t: new Date().toISOString(),
        method: req.method,
        path: url.pathname,
        status,
        ms: Date.now() - startedAt,
        ...extra,
      });
    };

    if (req.method === "GET" && url.pathname === "/healthz") {
      send(res, 200, { ok: true, service: "dodi-screenshot" });
      return;
    }

    if (url.pathname !== "/render") {
      send(res, 404, { error: "not_found" });
      finish(404);
      return;
    }

    if (req.method === "OPTIONS") {
      // Preflight from a browser: only configured origins get a grant.
      const status = Object.keys(cors).length > 0 ? 204 : 403;
      res.writeHead(status, cors);
      res.end();
      finish(status);
      return;
    }

    if (req.method !== "POST") {
      send(res, 405, { error: "method_not_allowed" }, cors);
      finish(405);
      return;
    }

    if (config.secret && !secretMatches(req.headers["x-screenshot-secret"] as string | undefined, config.secret)) {
      send(res, 401, { error: "unauthorized" }, cors);
      finish(401);
      return;
    }

    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX_BODY_BYTES) {
      send(res, 413, { error: "Document too large" }, cors);
      finish(413);
      return;
    }

    let raw: Buffer | null;
    try {
      raw = await readBody(req);
    } catch {
      send(res, 400, { error: "unreadable_body" }, cors);
      finish(400);
      return;
    }
    if (raw === null) {
      send(res, 413, { error: "Document too large" }, cors);
      finish(413);
      return;
    }

    let body: unknown = null;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      /* falls through to validation */
    }
    const parsed = ScreenshotRequestSchema.safeParse(body);
    if (!parsed.success) {
      send(res, 400, { error: "Validation failed", issues: parsed.error.issues }, cors);
      finish(400);
      return;
    }

    const request = parsed.data;
    const sizes = { documentBytes: request.document.length, steps: request.steps?.length ?? 0 };
    try {
      const result = await renderer.render(request);
      send(res, 200, result, cors);
      finish(200, { ...sizes, frames: result.frames.length, ready: result.ready });
    } catch (error) {
      if (error instanceof RenderBusyError) {
        send(res, 429, { error: "busy" }, cors);
        finish(429, sizes);
      } else if (error instanceof RenderTimeoutError) {
        send(res, 504, { error: "render_timeout" }, cors);
        finish(504, sizes);
      } else {
        send(res, 500, { error: "render_failed" }, cors);
        finish(500, { ...sizes, error: error instanceof Error ? error.message : String(error) });
      }
    }
  });
}
