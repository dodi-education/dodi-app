/**
 * Portable game archive — build/parse the files of a `.dodi-game.zip`.
 *
 * Pure + zip-agnostic: this module maps between a game row and a named file
 * map (`manifest.json`, `game.html`, `assets/background.*`, `assets/preview.*`,
 * `game.md`, `transcript.json`); the zip packing/unpacking itself lives with the client
 * (fflate), keeping core free of the dependency. The archive is designed for
 * cross-instance import, so no ids travel in it and `parseGameExportFiles`
 * treats its input as hostile: strict zod validation, per-file size caps, and
 * the same sanitizer/validator gates the studio applies to generated code.
 *
 * `game.html` is stored in `{{BACKGROUND_IMAGE}}` placeholder form (see
 * ./background-image) with the background as a real image file under
 * `assets/` — readable in the zip, re-injected on import.
 */
import type { Game } from "@dodi/types/database";
import { z } from "zod/v4";

import {
  extractBackgroundImage,
  hasBackgroundPlaceholder,
  injectBackgroundImage,
} from "./background-image";
import { isUnbuiltBundle } from "./placeholder";
import { getGameBundleLimitBytes, sanitizeGameBundle } from "./sanitizer";
import { validateGameCode } from "./agent-validator";
import { GAME_TAG_IDS } from "./tags";

// ── Archive contract ───────────────────────────────────────────────────────

export const GAME_EXPORT_FORMAT_VERSION = 1;
export const GAME_EXPORT_MANIFEST_FILE = "manifest.json";
export const GAME_EXPORT_CODE_FILE = "game.html";
export const GAME_EXPORT_MARKDOWN_FILE = "game.md";
export const GAME_EXPORT_TRANSCRIPT_FILE = "transcript.json";
export const GAME_EXPORT_FILE_SUFFIX = ".dodi-game.zip";

const BACKGROUND_FILE_RE = /^assets\/background\.(png|jpe?g|webp|gif|svg|avif)$/;
// The 100×100 list preview is always a sandbox capture, so raster-only — no
// svg (scriptable) and no gif (never produced by a canvas capture).
const PREVIEW_FILE_RE = /^assets\/preview\.(png|jpe?g|webp)$/;
const PREVIEW_MIME_RE = /^image\/(png|jpeg|webp)$/;

/** Hostile-input budgets for the archive (enforced by the zip layer + parse). */
export const GAME_EXPORT_ZIP_MAX_BYTES = 10 * 1024 * 1024;
export const GAME_EXPORT_ENTRY_MAX_BYTES = 8 * 1024 * 1024;
export const GAME_EXPORT_TOTAL_MAX_BYTES = 24 * 1024 * 1024;
export const GAME_EXPORT_MANIFEST_MAX_BYTES = 256 * 1024;
export const GAME_EXPORT_PREVIEW_MAX_BYTES = 512 * 1024;

const MARKDOWN_MAX_CHARS = 100_000;
const SUCCESS_CRITERIA_MAX_CHARS = 20_000;

/** Whether a zip entry path belongs to the archive contract (zip filter). */
export function isGameExportEntryPath(path: string): boolean {
  return (
    path === GAME_EXPORT_MANIFEST_FILE ||
    path === GAME_EXPORT_CODE_FILE ||
    path === GAME_EXPORT_MARKDOWN_FILE ||
    path === GAME_EXPORT_TRANSCRIPT_FILE ||
    BACKGROUND_FILE_RE.test(path) ||
    PREVIEW_FILE_RE.test(path)
  );
}

// ── Manifest schema ────────────────────────────────────────────────────────

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/** Whitelisted `GameMetadata` projection — unknown keys are stripped. */
const ManifestMetadataSchema = z.preprocess(
  // The studio persists "unspecified" settings as explicit nulls (jsonb) —
  // drop null entries so both build and parse treat them as absent.
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, v]) => v != null))
      : value,
  z.object({
    version: z.string().max(64).optional(),
    category: z.string().max(64).optional(),
    capabilities: z.array(z.string().max(64)).max(50).optional(),
    supportsVoiceCommands: z.boolean().optional(),
    drawingStyle: z.enum(["picture", "mandala"]).optional(),
    perspective: z.enum(["bird", "side", "isometric"]).optional(),
    generateBackgroundImage: z.boolean().optional(),
    generatePreviewImage: z.boolean().optional(),
  }),
);

/** Field caps mirror the games write routes; no cross-instance ids travel. */
export const GameExportManifestSchema = z
  .object({
    formatVersion: z.literal(GAME_EXPORT_FORMAT_VERSION),
    exportedAt: z.string().max(64),
    app: z.string().max(120).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000),
    tags: z.array(z.string().max(50)).max(20),
    learningGoal: z.string().max(2000),
    successDefinition: z.string().max(2000),
    successCriteria: z.record(z.string(), JsonValueSchema),
    progressKind: z.enum(["goal", "open"]),
    targetAgeMin: z.number().int().min(1).max(25),
    targetAgeMax: z.number().int().min(1).max(25),
    estimatedDurationMinutes: z.number().int().min(1).max(180),
    metadata: ManifestMetadataSchema,
    background: z
      .object({
        file: z.string().regex(BACKGROUND_FILE_RE),
        mimeType: z.string().regex(/^image\/[a-z+.-]+$/).max(40),
      })
      .nullable(),
    // Optional (not nullable) so archives from before previews stay valid.
    preview: z
      .object({
        file: z.string().regex(PREVIEW_FILE_RE),
        mimeType: z.string().regex(PREVIEW_MIME_RE).max(40),
      })
      .optional(),
    hasTranscript: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (JSON.stringify(val.successCriteria).length > SUCCESS_CRITERIA_MAX_CHARS) {
      ctx.addIssue({ code: "custom", message: "successCriteria exceeds the size limit" });
    }
  });

export type GameExportManifest = z.infer<typeof GameExportManifestSchema>;

/** Studio conversation shape (decrypted `agent_transcript_enc`), bounded. */
export const ExportTranscriptSchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      text: z.string().max(50_000),
      images: z
        .array(z.string().startsWith("data:image/").max(500_000))
        .max(3)
        .optional(),
    }),
  )
  .max(200);

export type ExportTranscript = z.infer<typeof ExportTranscriptSchema>;

// ── Data-URL helpers (isomorphic, chunked for large images) ────────────────

const DATA_URL_RE = /^data:([a-z0-9+.\/-]+);base64,([A-Za-z0-9+/=]+)$/i;

export function dataUrlToBytes(
  dataUrl: string,
): { mimeType: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mimeType: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

export function bytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000; // avoid String.fromCharCode arg-count limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

export function extensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? null;
}

/** Zip filename for a game title: slugged, e.g. `space-count.dodi-game.zip`. */
export function gameExportFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "game"}${GAME_EXPORT_FILE_SUFFIX}`;
}

// ── Build (export) ─────────────────────────────────────────────────────────

export type GameExportFileMap = Record<string, Uint8Array>;

export type ExportableGame = Pick<
  Game,
  | "title"
  | "description"
  | "tags"
  | "learning_goal"
  | "success_definition"
  | "success_criteria"
  | "progress_kind"
  | "target_age_min"
  | "target_age_max"
  | "estimated_duration_minutes"
  | "code_bundle"
  | "markdown"
  | "metadata"
  | "preview_image"
>;

export interface BuildGameExportInput {
  game: ExportableGame;
  /** Already-decrypted studio conversation; validated, included when set. */
  transcript?: unknown | null;
  /** Recorded as `app` in the manifest (provenance, informational only). */
  appVersion?: string;
  now?: Date;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function buildGameExportFiles(input: BuildGameExportInput): GameExportFileMap {
  const { game } = input;

  // Reverse-swap the inline background so game.html stays readable and small.
  // Unknown image types stay inline (self-contained beats extraction).
  const extracted = extractBackgroundImage(game.code_bundle);
  let codeHtml = game.code_bundle;
  let background: GameExportManifest["background"] = null;
  let backgroundBytes: Uint8Array | null = null;
  if (extracted.dataUrl) {
    const decoded = dataUrlToBytes(extracted.dataUrl);
    const extension = decoded ? extensionForMimeType(decoded.mimeType) : null;
    if (decoded && extension) {
      codeHtml = extracted.code;
      background = {
        file: `assets/background.${extension}`,
        mimeType: decoded.mimeType,
      };
      backgroundBytes = decoded.bytes;
    }
  }

  // The 100×100 list preview travels like the background: bytes under assets/,
  // declared in the manifest. Non-raster or undecodable values are dropped —
  // the importing side regenerates a preview on the next build or save.
  let preview: GameExportManifest["preview"];
  let previewBytes: Uint8Array | null = null;
  if (game.preview_image) {
    const decoded = dataUrlToBytes(game.preview_image);
    const extension =
      decoded && PREVIEW_MIME_RE.test(decoded.mimeType)
        ? extensionForMimeType(decoded.mimeType)
        : null;
    if (decoded && extension) {
      preview = { file: `assets/preview.${extension}`, mimeType: decoded.mimeType };
      previewBytes = decoded.bytes;
    }
  }

  const transcript =
    input.transcript == null ? null : ExportTranscriptSchema.parse(input.transcript);

  const manifest: GameExportManifest = GameExportManifestSchema.parse({
    formatVersion: GAME_EXPORT_FORMAT_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    ...(input.appVersion ? { app: input.appVersion } : {}),
    title: game.title,
    description: game.description,
    tags: game.tags,
    learningGoal: game.learning_goal,
    successDefinition: game.success_definition,
    successCriteria:
      game.success_criteria && typeof game.success_criteria === "object"
        ? game.success_criteria
        : {},
    progressKind: game.progress_kind,
    targetAgeMin: game.target_age_min,
    targetAgeMax: game.target_age_max,
    estimatedDurationMinutes: game.estimated_duration_minutes,
    metadata: game.metadata && typeof game.metadata === "object" ? game.metadata : {},
    background,
    ...(preview ? { preview } : {}),
    ...(transcript ? { hasTranscript: true } : {}),
  });

  const files: GameExportFileMap = {
    [GAME_EXPORT_MANIFEST_FILE]: textEncoder.encode(JSON.stringify(manifest, null, 2)),
    [GAME_EXPORT_CODE_FILE]: textEncoder.encode(codeHtml),
  };
  if (background && backgroundBytes) files[background.file] = backgroundBytes;
  if (preview && previewBytes) files[preview.file] = previewBytes;
  if (game.markdown.trim()) {
    files[GAME_EXPORT_MARKDOWN_FILE] = textEncoder.encode(game.markdown);
  }
  if (transcript) {
    files[GAME_EXPORT_TRANSCRIPT_FILE] = textEncoder.encode(
      JSON.stringify(transcript, null, 2),
    );
  }
  return files;
}

// ── Parse (import) ─────────────────────────────────────────────────────────

export type GameImportErrorCode =
  | "archive-too-large"
  | "archive-invalid"
  | "manifest-missing"
  | "manifest-invalid"
  | "unsupported-version"
  | "code-missing"
  | "code-too-large"
  | "background-missing"
  | "unsafe-code"
  | "invalid-code";

export class GameImportError extends Error {
  readonly code: GameImportErrorCode;
  readonly details: string[];

  constructor(code: GameImportErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = "GameImportError";
    this.code = code;
    this.details = details;
  }
}

export interface ParsedGameExport {
  manifest: GameExportManifest;
  /** Background re-injected + sanitized — ready to persist. Empty when unbuilt. */
  codeBundle: string;
  /** Manifest tags kept after catalog filtering — what an import should store. */
  tags: string[];
  markdown: string;
  transcript: ExportTranscript | null;
  /** The archive carries an unbuilt draft — import without code. */
  unbuilt: boolean;
  /** For a non-executing preview only; never persisted separately. */
  backgroundDataUrl: string | null;
  /** 100×100 list thumbnail — re-sealed and persisted as `preview_image`. */
  previewImageDataUrl: string | null;
  droppedTags: string[];
  warnings: string[];
}

function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/**
 * Validate a (hostile) archive file map into an import-ready game. Throws
 * `GameImportError`; non-critical extras (transcript, markdown, stray assets)
 * degrade to warnings instead of sinking the import.
 */
export function parseGameExportFiles(files: GameExportFileMap): ParsedGameExport {
  const warnings: string[] = [];

  // Manifest
  const manifestBytes = files[GAME_EXPORT_MANIFEST_FILE];
  if (!manifestBytes) {
    throw new GameImportError("manifest-missing", "The archive has no manifest.json");
  }
  if (manifestBytes.byteLength > GAME_EXPORT_MANIFEST_MAX_BYTES) {
    throw new GameImportError("manifest-invalid", "manifest.json exceeds the size limit");
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(decodeUtf8(manifestBytes));
  } catch {
    throw new GameImportError("manifest-invalid", "manifest.json is not valid JSON");
  }
  const rawVersion =
    manifestRaw && typeof manifestRaw === "object"
      ? (manifestRaw as { formatVersion?: unknown }).formatVersion
      : undefined;
  if (rawVersion !== GAME_EXPORT_FORMAT_VERSION) {
    throw new GameImportError(
      "unsupported-version",
      `Unsupported archive version ${String(rawVersion)}`,
    );
  }
  const parsedManifest = GameExportManifestSchema.safeParse(manifestRaw);
  if (!parsedManifest.success) {
    throw new GameImportError(
      "manifest-invalid",
      "manifest.json failed validation",
      parsedManifest.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const manifest = parsedManifest.data;

  // Code
  const codeBytes = files[GAME_EXPORT_CODE_FILE];
  if (!codeBytes) {
    throw new GameImportError("code-missing", "The archive has no game.html");
  }
  const codeHtml = decodeUtf8(codeBytes).trim();
  const unbuilt = isUnbuiltBundle(codeHtml);

  // Background: manifest entry ↔ asset file ↔ placeholder must agree.
  let backgroundDataUrl: string | null = null;
  let finalCode = codeHtml;
  if (!unbuilt && manifest.background) {
    if (!hasBackgroundPlaceholder(codeHtml)) {
      warnings.push("Background image ignored — the code never references it");
    } else {
      const assetBytes = files[manifest.background.file];
      if (!assetBytes) {
        throw new GameImportError(
          "background-missing",
          `The archive is missing ${manifest.background.file}`,
        );
      }
      backgroundDataUrl = bytesToDataUrl(manifest.background.mimeType, assetBytes);
      finalCode = injectBackgroundImage(codeHtml, backgroundDataUrl);
    }
  }
  const strayAsset = Object.keys(files).find(
    (path) =>
      (BACKGROUND_FILE_RE.test(path) && path !== manifest.background?.file) ||
      (PREVIEW_FILE_RE.test(path) && path !== manifest.preview?.file),
  );
  if (strayAsset) warnings.push(`Ignored unexpected asset ${strayAsset}`);

  // Preview thumbnail (non-critical): anything off-contract degrades to a
  // warning — a game imports fine without its list picture.
  let previewImageDataUrl: string | null = null;
  if (!unbuilt && manifest.preview) {
    const previewBytes = files[manifest.preview.file];
    if (!previewBytes) {
      warnings.push(`Preview image ignored — the archive is missing ${manifest.preview.file}`);
    } else if (previewBytes.byteLength > GAME_EXPORT_PREVIEW_MAX_BYTES) {
      warnings.push("Preview image ignored — it exceeds the size limit");
    } else {
      previewImageDataUrl = bytesToDataUrl(manifest.preview.mimeType, previewBytes);
    }
  }

  if (!unbuilt) {
    // Same gates as the studio: stored-size cap + blocked patterns on the final
    // bundle, then the structural validator on the placeholder form.
    if (textEncoder.encode(finalCode).byteLength > getGameBundleLimitBytes()) {
      throw new GameImportError("code-too-large", "Game code exceeds the size limit");
    }
    try {
      finalCode = sanitizeGameBundle(finalCode).code;
    } catch (error) {
      throw new GameImportError(
        "unsafe-code",
        error instanceof Error ? error.message : "Game code failed the safety check",
      );
    }
    const validation = validateGameCode(codeHtml, {
      progressKind: manifest.progressKind,
      capabilities: manifest.metadata.capabilities,
      hasBackgroundImage: backgroundDataUrl !== null,
    });
    if (!validation.valid) {
      throw new GameImportError(
        "invalid-code",
        "Game code failed validation",
        validation.errors,
      );
    }
  }

  // Tags: keep catalog tags, surface the rest.
  const catalog = new Set<string>(GAME_TAG_IDS);
  const tags = manifest.tags.filter((tag) => catalog.has(tag));
  const droppedTags = manifest.tags.filter((tag) => !catalog.has(tag));

  // Markdown (non-critical)
  let markdown = "";
  const markdownBytes = files[GAME_EXPORT_MARKDOWN_FILE];
  if (markdownBytes) {
    markdown = decodeUtf8(markdownBytes);
    if (markdown.length > MARKDOWN_MAX_CHARS) {
      markdown = markdown.slice(0, MARKDOWN_MAX_CHARS);
      warnings.push("Design doc truncated to the size limit");
    }
  }

  // Transcript (non-critical)
  let transcript: ExportTranscript | null = null;
  const transcriptBytes = files[GAME_EXPORT_TRANSCRIPT_FILE];
  if (transcriptBytes) {
    try {
      transcript = ExportTranscriptSchema.parse(JSON.parse(decodeUtf8(transcriptBytes)));
    } catch {
      warnings.push("Studio conversation was invalid and was skipped");
    }
  } else if (manifest.hasTranscript) {
    warnings.push("Manifest announces a studio conversation but the archive has none");
  }

  return {
    manifest,
    codeBundle: unbuilt ? "" : finalCode,
    tags,
    markdown,
    transcript,
    unbuilt,
    backgroundDataUrl,
    previewImageDataUrl,
    droppedTags,
    warnings,
  };
}
