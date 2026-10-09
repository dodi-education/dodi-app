/**
 * A game as a folder an agent edits with its normal file tools:
 *
 *   game.html   the bundle, exactly as the sandbox runs it
 *   game.md     YAML front matter (title, ages, success criteria, …) and, as
 *               the body, the briefing the companion reads while the kid plays
 *   preview.jpg optional list picture (.png / .webp work too)
 *   AGENTS.md   a short pointer for the agent
 *
 * Front matter is markdown-first on purpose: an agent reads and writes it like
 * any document, and the CLI maps it onto the games API.
 */
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SuccessCriteriaSchema } from "@dodi/games/success";
import { DECLARABLE_CAPABILITY_NAMES } from "@dodi/games/toolbox";
import { GAME_TAG_IDS } from "@dodi/games/tags";
import type { SuccessCriteria } from "@dodi/types/success";
import type { GamePerspective } from "@dodi/types/games";
import YAML from "yaml";

import { CliError, EXIT } from "./output";

export const GAME_FILE = "game.html";
export const META_FILE = "game.md";
const PREVIEW_FILES = ["preview.jpg", "preview.jpeg", "preview.png", "preview.webp"];

export interface ListingText {
  title: string;
  description: string;
}

/** The front matter of game.md. */
export interface GameMeta {
  title: string;
  description: string;
  /** The kid the game belongs to (its library). Default: the family's first kid. */
  kid?: string;
  /** "family" (every kid) or a list of kid ids. Default: family. */
  audience: "family" | string[];
  /** Kids see it in their library. */
  is_active: boolean;
  age_min?: number;
  age_max?: number;
  duration_minutes?: number;
  tags: string[];
  progress_kind: "goal" | "open";
  capabilities: string[];
  perspective?: GamePerspective;
  learning_goal: string;
  success_definition: string;
  success_criteria?: SuccessCriteria;
  /** Discover listing per platform locale (needed by `dodi games publish`). */
  listing?: Record<string, ListingText>;
  /** Written by `dodi games push`. */
  game_id?: string;
}

export interface GameProject {
  dir: string;
  meta: GameMeta;
  /** The companion briefing (game.md body). */
  briefing: string;
  code: string;
  /** data: URL of preview.* when present. */
  previewImage: string | null;
}

const PERSPECTIVES: readonly GamePerspective[] = ["bird", "side", "isometric"];

function fail(dir: string, message: string): never {
  throw new CliError(`${path.join(dir, META_FILE)}: ${message}`, EXIT.usage);
}

function stringField(dir: string, raw: Record<string, unknown>, key: string, fallback = ""): string {
  const value = raw[key] ?? fallback;
  if (typeof value !== "string") fail(dir, `"${key}" must be text`);
  return value;
}

function ageField(dir: string, raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  if (value == null) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 25) {
    fail(dir, `"${key}" must be a whole number from 1 to 25`);
  }
  return value as number;
}

/** Validate and normalize parsed front matter. Unknown keys are an error (typos). */
export function parseGameMeta(dir: string, raw: unknown): GameMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(dir, "front matter is missing");
  const r = raw as Record<string, unknown>;
  const known = new Set([
    "title", "description", "kid", "audience", "is_active", "age_min", "age_max",
    "duration_minutes", "tags", "progress_kind", "capabilities", "perspective",
    "learning_goal", "success_definition", "success_criteria", "listing", "game_id",
  ]);
  const unknown = Object.keys(r).filter((key) => !known.has(key));
  if (unknown.length) fail(dir, `unknown field(s): ${unknown.join(", ")}`);

  const title = stringField(dir, r, "title").trim();
  if (!title) fail(dir, '"title" is required');
  if (title.length > 200) fail(dir, '"title" is longer than 200 characters');

  const audience = r.audience ?? "family";
  if (audience !== "family" && !(Array.isArray(audience) && audience.every((id) => typeof id === "string"))) {
    fail(dir, '"audience" must be "family" or a list of kid ids');
  }

  const tags = (r.tags ?? []) as unknown;
  if (!Array.isArray(tags) || tags.some((tag) => !GAME_TAG_IDS.includes(tag as never))) {
    fail(dir, `"tags" must come from: ${GAME_TAG_IDS.join(", ")}`);
  }

  const capabilities = (r.capabilities ?? []) as unknown;
  if (!Array.isArray(capabilities) || capabilities.some((c) => !DECLARABLE_CAPABILITY_NAMES.includes(c as string))) {
    fail(dir, `"capabilities" must come from: ${DECLARABLE_CAPABILITY_NAMES.join(", ")}`);
  }

  const progressKind = r.progress_kind ?? "open";
  if (progressKind !== "goal" && progressKind !== "open") fail(dir, '"progress_kind" must be goal or open');

  if (r.perspective != null && !PERSPECTIVES.includes(r.perspective as GamePerspective)) {
    fail(dir, `"perspective" must be one of: ${PERSPECTIVES.join(", ")}`);
  }

  let successCriteria: SuccessCriteria | undefined;
  if (r.success_criteria != null) {
    const parsed = SuccessCriteriaSchema.safeParse({ requiredMetrics: [], ...(r.success_criteria as object) });
    if (!parsed.success) {
      fail(dir, `"success_criteria" is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    successCriteria = parsed.data as SuccessCriteria;
    if (successCriteria.requiredMetrics.length === 0) {
      successCriteria.requiredMetrics = [...new Set(successCriteria.conditions.map((c) => c.metric))];
    }
  }

  let listing: Record<string, ListingText> | undefined;
  if (r.listing != null) {
    if (typeof r.listing !== "object" || Array.isArray(r.listing)) fail(dir, '"listing" must map locales to { title, description }');
    listing = {};
    for (const [locale, value] of Object.entries(r.listing as Record<string, unknown>)) {
      const entry = value as Record<string, unknown> | null;
      if (!entry || typeof entry.title !== "string" || !entry.title.trim()) fail(dir, `listing.${locale}.title is required`);
      listing[locale] = { title: entry.title.trim(), description: typeof entry.description === "string" ? entry.description : "" };
    }
  }

  const ageMin = ageField(dir, r, "age_min");
  const ageMax = ageField(dir, r, "age_max");
  if (ageMin != null && ageMax != null && ageMin > ageMax) fail(dir, '"age_min" is above "age_max"');
  const duration = r.duration_minutes;
  if (duration != null && (!Number.isInteger(duration) || (duration as number) < 1 || (duration as number) > 180)) {
    fail(dir, '"duration_minutes" must be 1 to 180');
  }
  if (r.is_active != null && typeof r.is_active !== "boolean") fail(dir, '"is_active" must be true or false');

  return {
    title,
    description: stringField(dir, r, "description"),
    ...(typeof r.kid === "string" && r.kid ? { kid: r.kid } : {}),
    audience: audience as GameMeta["audience"],
    is_active: (r.is_active as boolean | undefined) ?? true,
    ...(ageMin != null ? { age_min: ageMin } : {}),
    ...(ageMax != null ? { age_max: ageMax } : {}),
    ...(duration != null ? { duration_minutes: duration as number } : {}),
    tags: tags as string[],
    progress_kind: progressKind,
    capabilities: capabilities as string[],
    ...(r.perspective ? { perspective: r.perspective as GamePerspective } : {}),
    learning_goal: stringField(dir, r, "learning_goal"),
    success_definition: stringField(dir, r, "success_definition"),
    ...(successCriteria ? { success_criteria: successCriteria } : {}),
    ...(listing ? { listing } : {}),
    ...(typeof r.game_id === "string" && r.game_id ? { game_id: r.game_id } : {}),
  };
}

/** Split "---\n<yaml>\n---\n<body>". */
export function splitFrontMatter(text: string): { yaml: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return match ? { yaml: match[1], body: match[2] } : null;
}

export function renderGameMd(meta: GameMeta, briefing: string): string {
  const yaml = YAML.stringify(meta, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${briefing.trim()}\n`;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
/** The games API caps a preview at ~1.5 MB of data URL. */
const MAX_PREVIEW_BYTES = 1_000_000;

export async function readGameProject(dirInput: string): Promise<GameProject> {
  const dir = path.resolve(dirInput);
  const metaPath = path.join(dir, META_FILE);
  const codePath = path.join(dir, GAME_FILE);
  if (!(await exists(metaPath)) || !(await exists(codePath))) {
    throw new CliError(
      `${dir} is not a dodi game folder (needs ${META_FILE} and ${GAME_FILE})`,
      EXIT.usage,
      "Create one with `dodi games new <folder>` or `dodi games pull <id>`.",
    );
  }
  const split = splitFrontMatter(await readFile(metaPath, "utf8"));
  if (!split) fail(dir, "must start with a --- front matter block");
  let raw: unknown;
  try {
    raw = YAML.parse(split.yaml);
  } catch (error) {
    fail(dir, `front matter is not valid YAML: ${(error as Error).message}`);
  }

  let previewImage: string | null = null;
  for (const name of PREVIEW_FILES) {
    const file = path.join(dir, name);
    if (await exists(file)) {
      const bytes = await readFile(file);
      if (bytes.byteLength > MAX_PREVIEW_BYTES) {
        throw new CliError(`${name} is over 1 MB`, EXIT.usage, "Use a smaller JPEG (about 512x640 is plenty).");
      }
      previewImage = `data:${MIME[path.extname(name)]};base64,${bytes.toString("base64")}`;
      break;
    }
  }

  return {
    dir,
    meta: parseGameMeta(dir, raw),
    briefing: split.body.trim(),
    code: await readFile(codePath, "utf8"),
    previewImage,
  };
}

export async function writeGameMeta(dir: string, meta: GameMeta, briefing: string): Promise<void> {
  await writeFile(path.join(dir, META_FILE), renderGameMd(meta, briefing));
}

/** Persisted plain fields → the create body (before sealing). */
export function toCreateBody(project: GameProject, kidId: string, kidIds: string[], sanitizedCode: string) {
  const { meta } = project;
  return {
    kidId,
    codeBundle: sanitizedCode,
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    markdown: project.briefing,
    learningGoal: meta.learning_goal,
    successDefinition: meta.success_definition,
    ...(meta.success_criteria ? { successCriteria: meta.success_criteria as never } : {}),
    progressKind: meta.progress_kind,
    ...(project.previewImage ? { previewImage: project.previewImage } : {}),
    ...(meta.age_min != null ? { targetAgeMin: meta.age_min } : {}),
    ...(meta.age_max != null ? { targetAgeMax: meta.age_max } : {}),
    ...(meta.duration_minutes != null ? { estimatedDurationMinutes: meta.duration_minutes } : {}),
    metadata: toMetadata(meta),
    isActive: meta.is_active,
    audience: toAudience(meta, kidIds),
  };
}

/** The update (PATCH) body for an existing game (before sealing). */
export function toUpdateBody(project: GameProject, kidIds: string[], sanitizedCode: string) {
  const { meta } = project;
  return {
    title: meta.title,
    description: meta.description,
    code_bundle: sanitizedCode,
    markdown: project.briefing,
    learning_goal: meta.learning_goal,
    success_definition: meta.success_definition,
    ...(meta.success_criteria ? { success_criteria: meta.success_criteria as never } : {}),
    ...(project.previewImage ? { preview_image: project.previewImage } : {}),
    tags: meta.tags,
    progress_kind: meta.progress_kind,
    ...(meta.age_min != null ? { target_age_min: meta.age_min } : {}),
    ...(meta.age_max != null ? { target_age_max: meta.age_max } : {}),
    ...(meta.duration_minutes != null ? { estimated_duration_minutes: meta.duration_minutes } : {}),
    metadata: toMetadata(meta),
    is_active: meta.is_active,
    audience: toAudience(meta, kidIds),
    create_version: true,
  };
}

function toMetadata(meta: GameMeta) {
  return {
    capabilities: meta.capabilities,
    ...(meta.perspective ? { perspective: meta.perspective } : {}),
    createdWith: "dodi-cli",
  };
}

function toAudience(meta: GameMeta, kidIds: string[]) {
  if (meta.audience === "family") return { isFamily: true, audienceIds: [] };
  const unknown = meta.audience.filter((id) => !kidIds.includes(id));
  if (unknown.length) {
    throw new CliError(`audience lists unknown kid id(s): ${unknown.join(", ")}`, EXIT.usage, "See `dodi kids`.");
  }
  return { isFamily: false, audienceIds: meta.audience };
}
