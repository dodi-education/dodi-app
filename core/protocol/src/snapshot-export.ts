/**
 * Portable snapshot archive — build/parse the files of a `.dodi-snap.zip`.
 *
 * Pure + zip-agnostic, mirroring `@dodi/games/export`: this module maps
 * between a DECRYPTED snapshot (info + payload, see ./snapshot) and a named
 * file map (`manifest.json`, `game.html`, `saved-state.json`, `game.md`,
 * `assets/thumbnail.*`); the zip packing/unpacking lives with the client
 * (fflate). The archive is plaintext by design — export decrypts in the
 * browser and import re-seals under the importing account's vault, so the
 * server never sees an archive.
 *
 * Designed for cross-account import: no ids travel in it (the payload's
 * `gameId` soft reference is dropped — the payload is self-contained), but the
 * exporting kid's display name does, so the importer can suggest the matching
 * kid on the target account. `parseSnapshotExportFiles` treats its input as
 * hostile: strict zod validation via the snapshot schemas, per-file caps, and
 * the same bundle sanitizer the player applies before any code is stored.
 */
import { sanitizeGameBundle } from "@dodi/games/sanitizer";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  extensionForMimeType,
} from "@dodi/games/export";
import type { SnapshotInfoV1, SnapshotPayloadV1 } from "@dodi/types/games";
import { z } from "zod/v4";

import {
  SNAPSHOT_TITLE_MAX_CHARS,
  SnapshotInfoSchema,
  SnapshotPayloadSchema,
} from "./snapshot";

// ── Archive contract ───────────────────────────────────────────────────────

export const SNAPSHOT_EXPORT_FORMAT_VERSION = 1;
export const SNAPSHOT_EXPORT_MANIFEST_FILE = "manifest.json";
export const SNAPSHOT_EXPORT_CODE_FILE = "game.html";
export const SNAPSHOT_EXPORT_STATE_FILE = "saved-state.json";
export const SNAPSHOT_EXPORT_MARKDOWN_FILE = "game.md";
export const SNAPSHOT_EXPORT_FILE_SUFFIX = ".dodi-snap.zip";

// Gallery thumbnails are sandbox canvas captures, so raster-only — no svg
// (scriptable) and no gif (never produced by a canvas capture).
const THUMBNAIL_FILE_RE = /^assets\/thumbnail\.(png|jpe?g|webp)$/;
const THUMBNAIL_MIME_RE = /^image\/(png|jpeg|webp)$/;

/** Hostile-input budgets for the archive (enforced by the zip layer + parse). */
export const SNAPSHOT_EXPORT_ZIP_MAX_BYTES = 10 * 1024 * 1024;
export const SNAPSHOT_EXPORT_ENTRY_MAX_BYTES = 4 * 1024 * 1024;
export const SNAPSHOT_EXPORT_TOTAL_MAX_BYTES = 12 * 1024 * 1024;
export const SNAPSHOT_EXPORT_MANIFEST_MAX_BYTES = 64 * 1024;
export const SNAPSHOT_EXPORT_THUMBNAIL_MAX_BYTES = 256 * 1024;

const MARKDOWN_MAX_CHARS = 50_000;

/** Whether a zip entry path belongs to the archive contract (zip filter). */
export function isSnapshotExportEntryPath(path: string): boolean {
  return (
    path === SNAPSHOT_EXPORT_MANIFEST_FILE ||
    path === SNAPSHOT_EXPORT_CODE_FILE ||
    path === SNAPSHOT_EXPORT_STATE_FILE ||
    path === SNAPSHOT_EXPORT_MARKDOWN_FILE ||
    THUMBNAIL_FILE_RE.test(path)
  );
}

// ── Manifest schema ────────────────────────────────────────────────────────

/**
 * Field caps mirror the snapshot payload schema; no cross-instance ids travel.
 * `kidName` is the exporting kid's display name — a matching hint for the
 * importer, never an identifier.
 */
export const SnapshotExportManifestSchema = z.object({
  formatVersion: z.literal(SNAPSHOT_EXPORT_FORMAT_VERSION),
  exportedAt: z.string().max(64),
  app: z.string().max(120).optional(),
  kidName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(SNAPSHOT_TITLE_MAX_CHARS),
  createdAt: z.string().max(64),
  gameTitle: z.string().max(200),
  gameDescription: z.string().max(2_000),
  capabilities: z.array(z.string().max(64)).max(50),
  drawingStyle: z.enum(["picture", "mandala"]),
  thumbnail: z
    .object({
      file: z.string().regex(THUMBNAIL_FILE_RE),
      mimeType: z.string().regex(THUMBNAIL_MIME_RE).max(40),
    })
    .nullable(),
});

export type SnapshotExportManifest = z.infer<typeof SnapshotExportManifestSchema>;

/** Zip filename for a snapshot title: slugged, e.g. `space-rescue.dodi-snap.zip`. */
export function snapshotExportFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "snapshot"}${SNAPSHOT_EXPORT_FILE_SUFFIX}`;
}

// ── Build (export) ─────────────────────────────────────────────────────────

export type SnapshotExportFileMap = Record<string, Uint8Array>;

export interface BuildSnapshotExportInput {
  /** Decrypted gallery info (title, game title, thumbnail). */
  info: SnapshotInfoV1;
  /** Decrypted, already re-sanitized payload. */
  payload: SnapshotPayloadV1;
  /** Decrypted display name of the kid the snapshot belongs to. */
  kidName: string;
  /** Recorded as `app` in the manifest (provenance, informational only). */
  appVersion?: string;
  now?: Date;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function buildSnapshotExportFiles(
  input: BuildSnapshotExportInput,
): SnapshotExportFileMap {
  const { info, payload } = input;

  // The thumbnail travels as real image bytes under assets/ (readable in the
  // zip). Non-raster or undecodable values are dropped — a snapshot imports
  // fine without its gallery picture.
  let thumbnail: SnapshotExportManifest["thumbnail"] = null;
  let thumbnailBytes: Uint8Array | null = null;
  if (info.thumbnail) {
    const decoded = dataUrlToBytes(info.thumbnail);
    const extension =
      decoded && THUMBNAIL_MIME_RE.test(decoded.mimeType)
        ? extensionForMimeType(decoded.mimeType)
        : null;
    if (decoded && extension) {
      thumbnail = {
        file: `assets/thumbnail.${extension}`,
        mimeType: decoded.mimeType,
      };
      thumbnailBytes = decoded.bytes;
    }
  }

  const manifest: SnapshotExportManifest = SnapshotExportManifestSchema.parse({
    formatVersion: SNAPSHOT_EXPORT_FORMAT_VERSION,
    exportedAt: (input.now ?? new Date()).toISOString(),
    ...(input.appVersion ? { app: input.appVersion } : {}),
    kidName: input.kidName,
    title: payload.title,
    createdAt: payload.createdAt,
    gameTitle: payload.gameTitle,
    gameDescription: payload.gameDescription,
    capabilities: payload.capabilities,
    drawingStyle: payload.drawingStyle,
    thumbnail,
  });

  const files: SnapshotExportFileMap = {
    [SNAPSHOT_EXPORT_MANIFEST_FILE]: textEncoder.encode(
      JSON.stringify(manifest, null, 2),
    ),
    [SNAPSHOT_EXPORT_CODE_FILE]: textEncoder.encode(payload.codeBundle),
    [SNAPSHOT_EXPORT_STATE_FILE]: textEncoder.encode(
      JSON.stringify(payload.savedState, null, 2),
    ),
  };
  if (thumbnail && thumbnailBytes) files[thumbnail.file] = thumbnailBytes;
  if (payload.gameMarkdown.trim()) {
    files[SNAPSHOT_EXPORT_MARKDOWN_FILE] = textEncoder.encode(payload.gameMarkdown);
  }
  return files;
}

// ── Parse (import) ─────────────────────────────────────────────────────────

export type SnapshotImportErrorCode =
  | "archive-too-large"
  | "archive-invalid"
  | "manifest-missing"
  | "manifest-invalid"
  | "unsupported-version"
  | "code-missing"
  | "unsafe-code"
  | "state-missing"
  | "state-invalid"
  | "payload-invalid";

export class SnapshotImportError extends Error {
  readonly code: SnapshotImportErrorCode;
  readonly details: string[];

  constructor(
    code: SnapshotImportErrorCode,
    message: string,
    details: string[] = [],
  ) {
    super(message);
    this.name = "SnapshotImportError";
    this.code = code;
    this.details = details;
  }
}

export interface ParsedSnapshotExport {
  manifest: SnapshotExportManifest;
  /** Schema-validated gallery info — ready to seal for the importing account. */
  info: SnapshotInfoV1;
  /** Schema-validated payload with SANITIZED game code — ready to seal. */
  payload: SnapshotPayloadV1;
  warnings: string[];
}

function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/**
 * Validate a (hostile) archive file map into an import-ready snapshot. Throws
 * `SnapshotImportError`; non-critical extras (thumbnail, markdown, stray
 * assets) degrade to warnings instead of sinking the import.
 */
export function parseSnapshotExportFiles(
  files: SnapshotExportFileMap,
): ParsedSnapshotExport {
  const warnings: string[] = [];

  // Manifest
  const manifestBytes = files[SNAPSHOT_EXPORT_MANIFEST_FILE];
  if (!manifestBytes) {
    throw new SnapshotImportError(
      "manifest-missing",
      "The archive has no manifest.json",
    );
  }
  if (manifestBytes.byteLength > SNAPSHOT_EXPORT_MANIFEST_MAX_BYTES) {
    throw new SnapshotImportError(
      "manifest-invalid",
      "manifest.json exceeds the size limit",
    );
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(decodeUtf8(manifestBytes));
  } catch {
    throw new SnapshotImportError(
      "manifest-invalid",
      "manifest.json is not valid JSON",
    );
  }
  const rawVersion =
    manifestRaw && typeof manifestRaw === "object"
      ? (manifestRaw as { formatVersion?: unknown }).formatVersion
      : undefined;
  if (rawVersion !== SNAPSHOT_EXPORT_FORMAT_VERSION) {
    throw new SnapshotImportError(
      "unsupported-version",
      `Unsupported archive version ${String(rawVersion)}`,
    );
  }
  const parsedManifest = SnapshotExportManifestSchema.safeParse(manifestRaw);
  if (!parsedManifest.success) {
    throw new SnapshotImportError(
      "manifest-invalid",
      "manifest.json failed validation",
      parsedManifest.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const manifest = parsedManifest.data;

  // Game code — sanitized with the same gates the player applies before any
  // snapshot code is stored or injected (size cap + blocked patterns).
  const codeBytes = files[SNAPSHOT_EXPORT_CODE_FILE];
  if (!codeBytes) {
    throw new SnapshotImportError("code-missing", "The archive has no game.html");
  }
  let codeBundle: string;
  try {
    codeBundle = sanitizeGameBundle(decodeUtf8(codeBytes)).code;
  } catch (error) {
    throw new SnapshotImportError(
      "unsafe-code",
      error instanceof Error ? error.message : "Game code failed the safety check",
    );
  }

  // Save state
  const stateBytes = files[SNAPSHOT_EXPORT_STATE_FILE];
  if (!stateBytes) {
    throw new SnapshotImportError(
      "state-missing",
      "The archive has no saved-state.json",
    );
  }
  let savedState: unknown;
  try {
    savedState = JSON.parse(decodeUtf8(stateBytes));
  } catch {
    throw new SnapshotImportError(
      "state-invalid",
      "saved-state.json is not valid JSON",
    );
  }
  if (
    savedState === null ||
    typeof savedState !== "object" ||
    Array.isArray(savedState)
  ) {
    throw new SnapshotImportError(
      "state-invalid",
      "saved-state.json must contain a JSON object",
    );
  }

  // Thumbnail (non-critical): anything off-contract degrades to a warning.
  let thumbnailDataUrl: string | null = null;
  if (manifest.thumbnail) {
    const thumbnailBytes = files[manifest.thumbnail.file];
    if (!thumbnailBytes) {
      warnings.push(
        `Thumbnail ignored — the archive is missing ${manifest.thumbnail.file}`,
      );
    } else if (thumbnailBytes.byteLength > SNAPSHOT_EXPORT_THUMBNAIL_MAX_BYTES) {
      warnings.push("Thumbnail ignored — it exceeds the size limit");
    } else {
      thumbnailDataUrl = bytesToDataUrl(manifest.thumbnail.mimeType, thumbnailBytes);
    }
  }
  const strayAsset = Object.keys(files).find(
    (path) => THUMBNAIL_FILE_RE.test(path) && path !== manifest.thumbnail?.file,
  );
  if (strayAsset) warnings.push(`Ignored unexpected asset ${strayAsset}`);

  // Markdown (non-critical)
  let gameMarkdown = "";
  const markdownBytes = files[SNAPSHOT_EXPORT_MARKDOWN_FILE];
  if (markdownBytes) {
    gameMarkdown = decodeUtf8(markdownBytes);
    if (gameMarkdown.length > MARKDOWN_MAX_CHARS) {
      gameMarkdown = gameMarkdown.slice(0, MARKDOWN_MAX_CHARS);
      warnings.push("Design doc truncated to the size limit");
    }
  }

  // Reassemble the two blobs and hold them to the exact schemas the sealed
  // rows obey — anything an archive smuggles past the manifest dies here.
  // `gameId` never travels: the payload is self-contained by contract.
  const payloadResult = SnapshotPayloadSchema.safeParse({
    v: 1,
    title: manifest.title,
    createdAt: manifest.createdAt,
    gameId: null,
    gameTitle: manifest.gameTitle,
    gameDescription: manifest.gameDescription,
    gameMarkdown,
    codeBundle,
    capabilities: manifest.capabilities,
    drawingStyle: manifest.drawingStyle,
    savedState,
  });
  if (!payloadResult.success) {
    throw new SnapshotImportError(
      "payload-invalid",
      "The archive's content failed validation",
      payloadResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const infoResult = SnapshotInfoSchema.safeParse({
    v: 1,
    title: manifest.title,
    gameTitle: manifest.gameTitle,
    thumbnail: thumbnailDataUrl,
    createdAt: manifest.createdAt,
  });
  if (!infoResult.success) {
    throw new SnapshotImportError(
      "payload-invalid",
      "The archive's listing info failed validation",
      infoResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  return {
    manifest,
    info: infoResult.data as SnapshotInfoV1,
    payload: payloadResult.data as SnapshotPayloadV1,
    warnings,
  };
}

// ── Kid matching (import target suggestion) ────────────────────────────────

export interface KidNameCandidate {
  id: string;
  name: string;
}

/**
 * Suggest the import target: case-insensitively match the archive's `kidName`
 * against the account's decrypted kid names. Only a UNIQUE match returns an
 * id — no match or two kids with the same name means the parent picks.
 */
export function matchKidByName(
  kidName: string,
  candidates: KidNameCandidate[],
): string | null {
  const needle = kidName.trim().toLowerCase();
  if (!needle) return null;
  const matches = candidates.filter(
    (candidate) => candidate.name.trim().toLowerCase() === needle,
  );
  return matches.length === 1 ? matches[0].id : null;
}
