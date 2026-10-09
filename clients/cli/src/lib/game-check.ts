/**
 * `dodi games check`: everything the platform and the apps would complain
 * about, before anything is uploaded.
 *
 *  1. static: the same sanitizer and validator Game Studio's own agent runs
 *     (blocked APIs, size, bridge protocol, capabilities, goal metrics,
 *     translations block), plus Discover's language coverage as a warning;
 *  2. runtime: the game really runs in a headless browser, sandboxed exactly
 *     like the apps. Locally with Playwright when it is installed
 *     (`--local`), otherwise through the platform's screenshot service. The
 *     report carries whether the game became ready, its runtime errors,
 *     layout collisions and the frames, saved as JPEGs next to the game.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateGameCode } from "@dodi/games/agent-validator";
import { buildSandboxSrcDoc } from "@dodi/games/sandbox-doc";
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import {
  DEFAULT_SCREENSHOT_VIEWPORT,
  SCREENSHOT_CONTRACT_VERSION,
  ScreenshotResponseSchema,
  ScreenshotStepSchema,
  type ScreenshotRequest,
  type ScreenshotResponse,
  type ScreenshotStep,
} from "@dodi/games/screenshot-contract";
import { coveredLocales, extractTranslations } from "@dodi/games/translations";
import { SUPPORTED_LOCALES } from "@dodi/intl/locales";
import { z } from "zod/v4";

import type { GameProject } from "./game-project";
import { CliError, EXIT } from "./output";
import type { Connection } from "./session";

export const CHECKS_FILE = "checks.json";

export interface RuntimeReport {
  via: "local" | "service";
  ready: boolean;
  errors: string[];
  warnings: string[];
  layoutIssues: string[];
  /** Saved frame files, relative to the game folder. */
  frames: string[];
}

export interface CheckReport {
  ok: boolean;
  /** Problems that block `push`. */
  errors: string[];
  /** Worth fixing; `publish` needs the translation ones fixed. */
  warnings: string[];
  sizeBytes: number;
  translations: { sourceLocale: string | null; covered: string[]; missingForDiscover: string[] };
  runtime: RuntimeReport | null;
}

export interface StaticResult {
  errors: string[];
  warnings: string[];
  sanitizedCode: string | null;
  sizeBytes: number;
  translations: CheckReport["translations"];
}

/** The static half: pure, no network. `push` runs it too. */
export function checkStatic(project: GameProject): StaticResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitizedCode: string | null = null;
  let sizeBytes = new TextEncoder().encode(project.code).byteLength;
  try {
    const sanitized = sanitizeGameBundle(project.code);
    sanitizedCode = sanitized.code;
    sizeBytes = sanitized.sizeBytes;
  } catch (error) {
    errors.push((error as Error).message);
  }

  const { meta } = project;
  const validation = validateGameCode(project.code, {
    progressKind: meta.progress_kind,
    requiredMetrics: meta.success_criteria?.requiredMetrics ?? [],
    capabilities: meta.capabilities,
    requireTranslations: true,
  });
  for (const error of validation.errors) if (!errors.includes(error)) errors.push(error);

  if (meta.progress_kind === "goal" && !meta.success_criteria?.conditions.length) {
    errors.push('progress_kind is "goal" but game.md has no success_criteria conditions');
  }
  if (!project.briefing) warnings.push("game.md has no briefing body: the companion won't know how to help");
  if (!meta.description.trim()) warnings.push("game.md has no description");
  if (!project.previewImage) warnings.push("no preview.jpg: the library shows a placeholder picture");

  const extracted = extractTranslations(project.code);
  const block = extracted.translations;
  const covered = block ? [...coveredLocales(block, SUPPORTED_LOCALES)] : [];
  const missing = SUPPORTED_LOCALES.filter((locale) => !covered.includes(locale));
  if (missing.length) {
    warnings.push(`Discover needs every language: the translations block is missing ${missing.join(", ")}`);
  }
  const listingMissing = SUPPORTED_LOCALES.filter((locale) => !meta.listing?.[locale]?.title);
  if (listingMissing.length) {
    warnings.push(`Discover needs a listing title per language: game.md listing is missing ${listingMissing.join(", ")}`);
  }

  return {
    errors,
    warnings,
    sanitizedCode,
    sizeBytes,
    translations: { sourceLocale: block?.sourceLocale ?? null, covered, missingForDiscover: missing },
  };
}

async function readSteps(dir: string): Promise<ScreenshotStep[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, CHECKS_FILE), "utf8");
  } catch {
    return [];
  }
  const parsed = z.array(ScreenshotStepSchema).max(4).safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new CliError(
      `${CHECKS_FILE} is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      EXIT.usage,
      'It is a list of up to 4 steps: [{ "label": "after answer", "command": { "type": "...", ... }, "waitMs": 500 }].',
    );
  }
  return parsed.data;
}

/** Local Playwright, via the screenshot worker's own renderer. Null when unavailable. */
async function renderLocally(request: ScreenshotRequest): Promise<ScreenshotResponse | null> {
  let createRenderer: typeof import("@dodi/screenshot/src/renderer").createRenderer;
  try {
    ({ createRenderer } = await import("@dodi/screenshot/src/renderer"));
  } catch {
    return null;
  }
  const renderer = createRenderer({
    maxConcurrent: 1,
    renderTimeoutMs: 20_000,
    readyTimeoutMs: 5_000,
    chromiumSandbox: false,
  });
  try {
    return await renderer.render(request);
  } catch (error) {
    const message = (error as Error).message;
    if (/Executable doesn't exist|browserType.launch|Cannot find module/i.test(message)) return null;
    throw error;
  } finally {
    await renderer.close();
  }
}

async function renderViaService(conn: Connection, request: ScreenshotRequest): Promise<ScreenshotResponse> {
  const res = await conn.client.request("/api/games/screenshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 503) {
    throw new CliError(
      "The dodi screenshot service is not available on this platform",
      EXIT.error,
      "Install Playwright for a local check: `npm i -g playwright && npx playwright install chromium`, then use --local.",
    );
  }
  if (res.status === 403) {
    throw new CliError(
      "The family turned the dodi screenshot service off",
      EXIT.forbidden,
      "Use --local (needs Playwright), or the parent can enable it under Settings > Game Studio.",
    );
  }
  if (!res.ok) throw new CliError(`Screenshot service failed (${res.status})`);
  const parsed = ScreenshotResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new CliError("Screenshot service answered in an unexpected shape");
  return parsed.data;
}

async function saveFrames(dir: string, response: ScreenshotResponse): Promise<string[]> {
  const out = path.join(dir, ".dodi", "check");
  await mkdir(out, { recursive: true });
  const saved: string[] = [];
  for (const [index, frame] of response.frames.entries()) {
    const slug = frame.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "frame";
    const name = `${index}-${slug}.jpg`;
    const base64 = frame.image.slice(frame.image.indexOf(",") + 1);
    await writeFile(path.join(out, name), Buffer.from(base64, "base64"));
    saved.push(path.join(".dodi", "check", name));
  }
  return saved;
}

export interface CheckOptions {
  runtime: "auto" | "local" | "service" | "none";
  locale?: string;
  /** Needed for the service; `auto` falls back to it when local is unavailable. */
  connect?: () => Promise<Connection>;
}

export async function checkGame(project: GameProject, options: CheckOptions): Promise<CheckReport> {
  const result = checkStatic(project);
  let runtime: RuntimeReport | null = null;

  if (options.runtime !== "none" && result.sanitizedCode) {
    const request: ScreenshotRequest = {
      version: SCREENSHOT_CONTRACT_VERSION,
      document: buildSandboxSrcDoc(result.sanitizedCode),
      viewport: DEFAULT_SCREENSHOT_VIEWPORT,
      ...(options.locale ? { locale: options.locale } : {}),
      steps: await readSteps(project.dir),
    };
    let response: ScreenshotResponse | null = null;
    let via: RuntimeReport["via"] = "local";
    if (options.runtime === "local" || options.runtime === "auto") {
      response = await renderLocally(request);
      if (!response && options.runtime === "local") {
        throw new CliError(
          "Playwright with Chromium is not installed",
          EXIT.error,
          "Run `npm i -g playwright && npx playwright install chromium`, or drop --local to use the dodi screenshot service.",
        );
      }
    }
    if (!response && options.connect) {
      via = "service";
      response = await renderViaService(await options.connect(), request);
    }
    if (response) {
      runtime = {
        via,
        ready: response.ready,
        errors: response.errors,
        warnings: response.warnings,
        layoutIssues: response.layoutIssues ?? [],
        frames: await saveFrames(project.dir, response),
      };
      if (!response.ready) {
        result.errors.push("The game never sent game:ready: it crashed or does not speak the bridge protocol");
      }
      for (const error of response.errors) result.errors.push(`runtime: ${error}`);
      for (const warning of response.warnings) result.warnings.push(`runtime: ${warning}`);
      for (const issue of runtime.layoutIssues) result.warnings.push(`layout: ${issue}`);
    } else {
      result.warnings.push("Skipped the runtime check: no local Playwright and not connected to dodi");
    }
  }

  return {
    ok: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings,
    sizeBytes: result.sizeBytes,
    translations: result.translations,
    runtime,
  };
}
