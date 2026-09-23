/**
 * Screenshot-service wire contract (v1) plus the account setting that selects a
 * service.
 *
 * The game agent runs in the browser, and browser JavaScript cannot rasterize
 * its own rendered output. Real screenshots therefore come from a renderer
 * OUTSIDE the page: a headless browser the client posts the finished sandbox
 * document to. Three parties speak this one shape: the dodi screenshot worker
 * (`screenshot/`), the platform's authenticated proxy in front of it
 * (`POST /api/games/screenshot`), and any self-hosted service a parent points
 * the studio at instead. From the client's point of view they are
 * interchangeable: a URL that takes a document and returns frames.
 *
 * Transient by contract: a service renders, screenshots, answers, and keeps
 * nothing. The client sends the FINAL srcdoc (background injected, host shim +
 * CSP applied), never the raw bundle, so the worker is render-only and needs
 * nothing but the bridge envelope to drive the game.
 */

import { z } from "zod/v4";

import type { GameScreenshotServiceSettings } from "@dodi/types/database";

import { GameCommandSchema } from "./bridge-protocol";
import { STAGE } from "./stage";

export const SCREENSHOT_CONTRACT_VERSION = 1;

/** Hard bounds every party enforces (the client trusts no service). */
export const SCREENSHOT_LIMITS = {
  /** A bundle (< 200 KB) + an inlined background (~160 KB) + shim/CSP. */
  MAX_DOCUMENT_BYTES: 1_500_000,
  MIN_VIEWPORT: 320,
  MAX_VIEWPORT: 1280,
  /** Frames after the opening screen. */
  MAX_STEPS: 4,
  DEFAULT_SETTLE_MS: 600,
  MAX_SETTLE_MS: 3000,
  DEFAULT_STEP_WAIT_MS: 500,
  MAX_STEP_WAIT_MS: 3000,
  /** Opening screen + one per step. */
  MAX_FRAMES: 5,
  MAX_FRAME_BYTES: 2_000_000,
  MAX_ERRORS: 20,
  MAX_ERROR_CHARS: 300,
  MAX_LABEL_CHARS: 80,
  /** Measured layout collisions reported per render (most severe first). */
  MAX_LAYOUT_ISSUES: 8,
  JPEG_QUALITY: 85,
} as const;

const LabelSchema = z.string().min(1).max(SCREENSHOT_LIMITS.MAX_LABEL_CHARS);

/** One interaction to drive after the opening screen; a frame follows it. */
export const ScreenshotStepSchema = z.object({
  label: LabelSchema,
  /** A `dodi:command` payload from the standard vocabulary. Absent = just wait. */
  command: GameCommandSchema.optional(),
  /** How long to give the game after the command (or plain wait) before shooting. */
  waitMs: z.number().int().min(0).max(SCREENSHOT_LIMITS.MAX_STEP_WAIT_MS).optional(),
});

export const ScreenshotViewportSchema = z.object({
  width: z
    .number()
    .int()
    .min(SCREENSHOT_LIMITS.MIN_VIEWPORT)
    .max(SCREENSHOT_LIMITS.MAX_VIEWPORT),
  height: z
    .number()
    .int()
    .min(SCREENSHOT_LIMITS.MIN_VIEWPORT)
    .max(SCREENSHOT_LIMITS.MAX_VIEWPORT),
});

/** The stage size a child sees: 4:5 portrait at the design reference size. */
export const DEFAULT_SCREENSHOT_VIEWPORT = {
  width: STAGE.logicalWidth,
  height: STAGE.logicalHeight,
} as const;

export const ScreenshotRequestSchema = z.object({
  version: z.literal(SCREENSHOT_CONTRACT_VERSION),
  /** The complete srcdoc HTML, exactly what the sandbox iframe would load. */
  document: z.string().min(1).max(SCREENSHOT_LIMITS.MAX_DOCUMENT_BYTES),
  viewport: ScreenshotViewportSchema.optional(),
  /** Delivered in `dodi:init` so translated text renders in this language. */
  locale: z.string().min(2).max(35).optional(),
  /** Pause after `game:ready` before the opening-screen frame. */
  settleMs: z.number().int().min(0).max(SCREENSHOT_LIMITS.MAX_SETTLE_MS).optional(),
  steps: z.array(ScreenshotStepSchema).max(SCREENSHOT_LIMITS.MAX_STEPS).optional(),
});

const IMAGE_DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const ScreenshotFrameSchema = z.object({
  label: LabelSchema,
  image: z.string().max(SCREENSHOT_LIMITS.MAX_FRAME_BYTES).regex(IMAGE_DATA_URL_RE),
});

const NoteSchema = z.string().max(SCREENSHOT_LIMITS.MAX_ERROR_CHARS);

export const ScreenshotResponseSchema = z.object({
  version: z.literal(SCREENSHOT_CONTRACT_VERSION),
  /** Frame 0 is always the opening screen ("initial"), then one per step. */
  frames: z.array(ScreenshotFrameSchema).max(SCREENSHOT_LIMITS.MAX_FRAMES),
  /** `game:ready` arrived before the timeout. False = the game crashed on init. */
  ready: z.boolean(),
  /** Soft problems, e.g. "step 2: no game:result within 500ms". */
  warnings: z.array(NoteSchema).max(SCREENSHOT_LIMITS.MAX_ERRORS),
  /** Uncaught exceptions and console.error output from the game (capped). */
  errors: z.array(NoteSchema).max(SCREENSHOT_LIMITS.MAX_ERRORS),
  /**
   * Measured layout collisions: visible UI elements covering or cutting into
   * each other, one readable line per pair, naming the frames it shows up in.
   * Optional, so a service that does not measure still speaks v1.
   */
  layoutIssues: z.array(NoteSchema).max(SCREENSHOT_LIMITS.MAX_LAYOUT_ISSUES).optional(),
});

export type ScreenshotStep = z.infer<typeof ScreenshotStepSchema>;
export type ScreenshotViewport = z.infer<typeof ScreenshotViewportSchema>;
export type ScreenshotRequest = z.infer<typeof ScreenshotRequestSchema>;
export type ScreenshotFrame = z.infer<typeof ScreenshotFrameSchema>;
export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>;

// ---------------------------------------------------------------------------
// Account setting: which service (if any) the studio uses
// ---------------------------------------------------------------------------

export const GAME_SCREENSHOT_SERVICE_MODES = ["off", "dodi", "custom"] as const;

/**
 * Shape of `accounts.game_screenshot_service`. `mode` is plaintext (operational,
 * the platform enforces the opt-in server-side); the custom URL is sealed
 * client-side because only the browser ever calls it.
 */
export const GameScreenshotServiceSettingsSchema: z.ZodType<GameScreenshotServiceSettings> =
  z
    .object({
      mode: z.enum(GAME_SCREENSHOT_SERVICE_MODES),
      customUrlEnc: z.string().startsWith("enc:v1:").optional(),
    })
    .refine((s) => s.mode !== "custom" || Boolean(s.customUrlEnc), {
      message: "custom mode requires customUrlEnc",
      path: ["customUrlEnc"],
    });

/** Accounts that never touched the setting (matches the column default). */
export const DEFAULT_GAME_SCREENSHOT_SERVICE: GameScreenshotServiceSettings = {
  mode: "dodi",
};

/** Read the jsonb column defensively; anything malformed reads as the default. */
export function parseGameScreenshotServiceSettings(
  value: unknown,
): GameScreenshotServiceSettings {
  const parsed = GameScreenshotServiceSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GAME_SCREENSHOT_SERVICE;
}

/**
 * A custom service URL the browser may post game documents to: https anywhere,
 * or plain http only on loopback (local testing). No credentials, no fragment.
 */
export function isAllowedCustomServiceUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
