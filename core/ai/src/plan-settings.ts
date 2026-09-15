/**
 * Derive the studio's game settings from an approved plan.
 *
 * When the parent accepts a plan in the Plan step, the settings form should
 * already be filled in: title, learning goal, success definition, tags, age
 * range and perspective all follow from what was just agreed. One structured
 * call reads the FINAL plan text (which the parent may have edited by hand, so
 * the plan agent's own proposal is not a reliable source) and maps it onto the
 * form's fields.
 *
 * Mirrors success-mapping.ts: runs in the browser via the shared client
 * thinking provider, with the vault-decrypted key passed in-memory.
 */

import { GAME_TAG_IDS, type GameTag } from "@dodi/games/tags";
import type { GamePerspective } from "@dodi/types/games";

import { createClientThinkingProvider, type UsageSink } from "./client-thinking";
import type { GameModelKey } from "./success-mapping";

/** Age bounds of the studio's age-range control (kept in sync with AgeRange). */
const AGE_MIN = 1;
const AGE_MAX = 25;

/** The settings form is a parent surface — a long title breaks its layout. */
const MAX_TITLE_CHARS = 60;

const PERSPECTIVES: readonly GamePerspective[] = ["bird", "side", "isometric"];

export interface PlanSettings {
  title: string;
  learningGoal: string;
  successDefinition: string;
  tags: GameTag[];
  targetAgeMin: number;
  targetAgeMax: number;
  perspective: GamePerspective | null;
}

export interface PlanSettingsContext {
  /** The audience child's age, when known — anchors the recommended range. */
  kidAge?: number;
  /** Display name of the language the title/goal should be written in. */
  language: string;
  /** Current form values, used when the model omits or garbles the range. */
  defaultAgeMin: number;
  defaultAgeMax: number;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readAge(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(n)) return null;
  return Math.min(AGE_MAX, Math.max(AGE_MIN, n));
}

function readTags(value: unknown): GameTag[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<GameTag>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim() as GameTag;
    if (GAME_TAG_IDS.includes(tag)) seen.add(tag);
  }
  return [...seen];
}

function readPerspective(value: unknown): GamePerspective | null {
  return typeof value === "string" && PERSPECTIVES.includes(value as GamePerspective)
    ? (value as GamePerspective)
    : null;
}

/**
 * Validate a model's JSON into settings the form can hold. Every field falls
 * back rather than throwing: a half-usable prefill still saves the parent work,
 * and the form validates the mandatory fields again on save.
 */
export function coercePlanSettings(
  raw: Record<string, unknown>,
  ctx: PlanSettingsContext,
): PlanSettings {
  const min = readAge(raw.targetAgeMin);
  const max = readAge(raw.targetAgeMax);
  // A single valid bound is still better than none — mirror it onto the other.
  let targetAgeMin = min ?? max ?? ctx.defaultAgeMin;
  let targetAgeMax = max ?? min ?? ctx.defaultAgeMax;
  if (targetAgeMin > targetAgeMax) [targetAgeMin, targetAgeMax] = [targetAgeMax, targetAgeMin];

  return {
    title: readString(raw.title).slice(0, MAX_TITLE_CHARS),
    learningGoal: readString(raw.learningGoal),
    successDefinition: readString(raw.successDefinition),
    tags: readTags(raw.tags),
    targetAgeMin,
    targetAgeMax,
    perspective: readPerspective(raw.perspective),
  };
}

export async function derivePlanSettings(
  model: GameModelKey,
  planText: string,
  ctx: PlanSettingsContext,
  onUsage?: UsageSink,
): Promise<PlanSettings> {
  const system = [
    "A parent just approved a plan for a small learning game their child will play.",
    "Read the plan and fill in the game's settings form.",
    "",
    "Return ONLY JSON with exactly these keys:",
    '{ "title": string, "learningGoal": string, "successDefinition": string,',
    '  "tags": string[], "targetAgeMin": number, "targetAgeMax": number,',
    '  "perspective": "bird" | "side" | "isometric" | null }',
    "",
    `Write title, learningGoal and successDefinition in ${ctx.language}.`,
    `- title: the game's name as a child would see it. Short, concrete, playful, at most ${MAX_TITLE_CHARS} characters. No quotes, no subtitle.`,
    "- learningGoal: one or two sentences, in the parent's voice, naming what the child practises.",
    "- successDefinition: ONE measurable, plain-language condition for having succeeded",
    '  (e.g. "solves 10 additions with at most 2 mistakes"). Use "" when the plan describes',
    "  open-ended play with no finish line. Never invent a number the plan does not support.",
    `- tags: 1 to 4 ids from this catalog ONLY: ${GAME_TAG_IDS.join(", ")}. Pick the subjects the game actually trains. Return [] if none fit.`,
    "- targetAgeMin / targetAgeMax: whole years the game suits, between 1 and 25.",
    ctx.kidAge
      ? `  The child is ${ctx.kidAge}; stay close to that (about 2 years either side) unless the plan clearly aims wider.`
      : "  Infer the range from the plan's difficulty.",
    "- perspective: the camera the plan implies. Use null when it does not imply one.",
    "  bird = seen from above, side = flat side-on view, isometric = angled 3D-ish view.",
    "",
    "Never include the child's name or any personal detail in any field.",
  ].join("\n");

  const provider = createClientThinkingProvider(
    model.providerId,
    model.apiKey,
    model.modelId,
    onUsage,
  );
  const raw = await provider.generateJson(system, `Approved plan:\n\n${planText}`);

  return coercePlanSettings(raw, ctx);
}
