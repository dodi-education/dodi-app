/**
 * Headless rendering of one game document into real frames.
 *
 * Per request: a fresh, offline browser context; the host page with a
 * sandboxed iframe; the document as srcdoc; the bridge handshake
 * (dodi:init ⇄ game:ready, retried like the app's GameSandbox); a settle
 * pause; the opening-screen frame; then one dodi:command per step with a
 * frame after each. Uncaught exceptions and console.error output from the
 * game are collected into `errors`, so a build also learns about crashes
 * static validation cannot see.
 *
 * Transient by construction: nothing touches disk, the context is closed in
 * `finally`, and the only thing logged is sizes and timings (server.ts).
 */

import { randomUUID } from "node:crypto";

import { chromium, type Browser, type Page } from "playwright";

import { createBridgeToken } from "@dodi/games/bridge-protocol";
import {
  DEFAULT_SCREENSHOT_VIEWPORT,
  SCREENSHOT_CONTRACT_VERSION,
  SCREENSHOT_LIMITS,
  type ScreenshotFrame,
  type ScreenshotRequest,
  type ScreenshotResponse,
} from "@dodi/games/screenshot-contract";

import { buildHostPage } from "./host-page";
import { collectLayoutIssues, probeLayoutScript, type ProbedOverlap } from "./layout-probe";

/** Mirrors GameSandbox: re-post dodi:init until the game answers. */
const INIT_RETRY_MS = 300;
/** Let the game paint the result of a command before the frame. */
const POST_COMMAND_PAINT_MS = 150;
/** Queue depth as a multiple of the concurrency, beyond which we answer 429. */
const MAX_QUEUE_FACTOR = 2;

export interface RendererOptions {
  maxConcurrent: number;
  renderTimeoutMs: number;
  readyTimeoutMs: number;
  chromiumSandbox: boolean;
}

export interface Renderer {
  render(request: ScreenshotRequest): Promise<ScreenshotResponse>;
  close(): Promise<void>;
}

export class RenderBusyError extends Error {
  constructor() {
    super("render queue is full");
    this.name = "RenderBusyError";
  }
}

export class RenderTimeoutError extends Error {
  constructor(ms: number) {
    super(`render exceeded ${ms}ms`);
    this.name = "RenderTimeoutError";
  }
}

type GameMessage = { type: string; token?: string; payload?: Record<string, unknown> };

/** Window shape of the host page (host-page.ts) as seen from page.evaluate. */
interface HostWindow {
  __postToGame: (msg: unknown) => void;
  __loadGame: (doc: string) => Promise<void>;
}

function note(list: string[], text: string): void {
  if (list.length >= SCREENSHOT_LIMITS.MAX_ERRORS) return;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed) list.push(trimmed.slice(0, SCREENSHOT_LIMITS.MAX_ERROR_CHARS));
}

/** Minimal message bus over the host page's relay: await one matching message. */
class GameInbox {
  #waiters = new Set<(msg: GameMessage) => void>();

  push(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const msg = parsed as GameMessage;
    if (typeof msg.type !== "string") return;
    for (const waiter of this.#waiters) waiter(msg);
  }

  /** Resolves with the first message matching `predicate`, or null after `timeoutMs`. */
  waitFor(predicate: (msg: GameMessage) => boolean, timeoutMs: number): Promise<GameMessage | null> {
    return new Promise((resolve) => {
      const waiter = (msg: GameMessage): void => {
        if (!predicate(msg)) return;
        done(msg);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      const done = (value: GameMessage | null): void => {
        clearTimeout(timer);
        this.#waiters.delete(waiter);
        resolve(value);
      };
      this.#waiters.add(waiter);
    });
  }
}

async function drive(
  page: Page,
  request: ScreenshotRequest,
  opts: RendererOptions,
): Promise<ScreenshotResponse> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const frames: ScreenshotFrame[] = [];
  const inbox = new GameInbox();
  const token = createBridgeToken();

  page.on("pageerror", (error) => note(errors, error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") note(errors, msg.text());
  });
  await page.exposeFunction("__onGameMessage", (json: string) => inbox.push(json));
  // A game may also report protocol-level errors explicitly.
  void inbox.waitFor((msg) => {
    if (msg.type === "game:error") {
      const detail = msg.payload?.error;
      note(errors, `game:error: ${typeof detail === "string" ? detail : "unknown"}`);
    }
    return false;
  }, opts.renderTimeoutMs);

  const viewport = request.viewport ?? DEFAULT_SCREENSHOT_VIEWPORT;
  await page.setContent(buildHostPage(viewport), { waitUntil: "load" });
  await page.evaluate(
    (doc) => (window as unknown as HostWindow).__loadGame(doc),
    request.document,
  );

  const post = (msg: unknown): Promise<void> =>
    page.evaluate((m) => (window as unknown as HostWindow).__postToGame(m), msg);
  const shoot = async (): Promise<string> => {
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: SCREENSHOT_LIMITS.JPEG_QUALITY,
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
    });
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  };
  // Measure collisions in the game frame right after each shot, so the
  // findings describe exactly what the frame shows. A probe that fails (the
  // game navigated, the frame is gone) just reports nothing.
  const probes: ProbedOverlap[][] = [];
  const probe = async (): Promise<void> => {
    const gameFrame = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
    const found = gameFrame
      ? await gameFrame
          .evaluate<ProbedOverlap[]>(
            probeLayoutScript({ maxOverlaps: SCREENSHOT_LIMITS.MAX_LAYOUT_ISSUES }),
          )
          .catch(() => [])
      : [];
    probes.push(found);
  };

  // Handshake: retry dodi:init until game:ready (the game's own listener may
  // register a tick after the iframe's load event).
  const init = {
    type: "dodi:init",
    token,
    payload: { gameId: randomUUID(), ...(request.locale ? { locale: request.locale } : {}) },
  };
  const readyPromise = inbox.waitFor(
    (msg) => msg.type === "game:ready" && msg.token === token,
    opts.readyTimeoutMs,
  );
  const retry = setInterval(() => void post(init).catch(() => {}), INIT_RETRY_MS);
  await post(init).catch(() => {});
  const ready = (await readyPromise) !== null;
  clearInterval(retry);

  await page.waitForTimeout(request.settleMs ?? SCREENSHOT_LIMITS.DEFAULT_SETTLE_MS);
  frames.push({ label: "initial", image: await shoot() });
  await probe();

  const steps = request.steps ?? [];
  if (!ready && steps.length > 0) {
    warnings.push(`skipped ${steps.length} step(s): the game never became ready`);
  } else {
    for (const [index, step] of steps.entries()) {
      const waitMs = step.waitMs ?? SCREENSHOT_LIMITS.DEFAULT_STEP_WAIT_MS;
      if (step.command) {
        const resultPromise = inbox.waitFor(
          (msg) => msg.type === "game:result" && msg.token === token,
          waitMs,
        );
        await post({ type: "dodi:command", token, payload: { command: step.command } });
        if ((await resultPromise) === null) {
          warnings.push(`step ${index + 1} (${step.label}): no game:result within ${waitMs}ms`);
        }
        await page.waitForTimeout(POST_COMMAND_PAINT_MS);
      } else {
        await page.waitForTimeout(waitMs);
      }
      frames.push({ label: step.label, image: await shoot() });
      await probe();
    }
  }

  const layoutIssues = collectLayoutIssues(
    probes,
    frames.map((frame) => frame.label),
  );
  return {
    version: SCREENSHOT_CONTRACT_VERSION,
    frames,
    ready,
    warnings,
    errors,
    ...(layoutIssues.length > 0 ? { layoutIssues } : {}),
  };
}

export function createRenderer(opts: RendererOptions): Renderer {
  let browserPromise: Promise<Browser> | null = null;
  let active = 0;
  const waiting: Array<() => void> = [];

  // One shared browser, launched lazily. A failed launch or a browser that
  // later dies (crash, OOM kill) is forgotten, so the next render relaunches
  // instead of failing until the process restarts.
  const browser = (): Promise<Browser> => {
    if (browserPromise) return browserPromise;
    const launching = chromium
      .launch({ headless: true, chromiumSandbox: opts.chromiumSandbox })
      .then((launched) => {
        launched.on("disconnected", () => {
          if (browserPromise === launching) browserPromise = null;
        });
        return launched;
      });
    launching.catch(() => {
      if (browserPromise === launching) browserPromise = null;
    });
    browserPromise = launching;
    return launching;
  };

  async function acquire(): Promise<void> {
    if (active < opts.maxConcurrent) {
      active++;
      return;
    }
    if (waiting.length >= opts.maxConcurrent * MAX_QUEUE_FACTOR) throw new RenderBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
  }

  function release(): void {
    active--;
    waiting.shift()?.();
  }

  async function renderOnce(request: ScreenshotRequest): Promise<ScreenshotResponse> {
    const viewport = request.viewport ?? DEFAULT_SCREENSHOT_VIEWPORT;
    const context = await (await browser()).newContext({
      viewport,
      deviceScaleFactor: 1,
      // The document's CSP already forbids network; the context is offline and
      // every request is aborted as belt and braces.
      offline: true,
      javaScriptEnabled: true,
    });
    try {
      const page = await context.newPage();
      await page.route("**/*", (route) => route.abort());
      const work = drive(page, request, opts);
      // A timeout closes the context underneath `work`; swallow its rejection
      // so it never surfaces as an unhandled promise.
      work.catch(() => {});
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RenderTimeoutError(opts.renderTimeoutMs)), opts.renderTimeoutMs);
      });
      try {
        return await Promise.race([work, deadline]);
      } finally {
        clearTimeout(timer);
      }
    } finally {
      await context.close().catch(() => {});
    }
  }

  return {
    async render(request) {
      await acquire();
      try {
        return await renderOnce(request);
      } finally {
        release();
      }
    },
    async close() {
      const open = browserPromise;
      browserPromise = null;
      if (open) await open.then((b) => b.close()).catch(() => {});
    },
  };
}
