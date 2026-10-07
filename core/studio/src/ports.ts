/**
 * What a client plugs into the headless studio build: everything the build
 * needs that differs between the web app and the mobile app (raster work,
 * where the vault session and provider keys come from, local storage, the
 * screenshot service, telemetry). The build logic itself lives once, in
 * build-runner.ts, and never touches a DOM, a React tree or a platform API.
 */

import type { RenderGameInput, RenderGameOutput } from "@dodi/ai/game-agent-tools";
import type { AIProviderId } from "@dodi/types/ai";
import type { Game } from "@dodi/types/database";
import type { ErrorLogContext, ErrorLogMeta } from "@dodi/types/error-logs";
import type { UsageReport } from "@dodi/types/usage";
import type { VaultSession } from "@dodi/vault";

/** A provider + model + vault-decrypted key, resolved on the device. Memory only. */
export interface ResolvedExecution {
  provider: Exclude<AIProviderId, "dodi">;
  model: string;
  apiKey: string;
  /** A dodi AI key (dodi's provider account) rather than the parent's own. */
  isManaged?: boolean;
}

export interface ImageBound {
  maxWidth: number;
  maxHeight: number;
  /** JPEG quality 0..1. */
  quality: number;
}

/** Raster work: a canvas on the web, a native image manipulator on mobile. */
export interface ImageOps {
  /** Downscale into a bounded JPEG data URL; null when the image can't be read. */
  downscale(dataUrl: string, bound: ImageBound): Promise<string | null>;
  /** Center-crop a square and scale it to `size`×`size`; null on failure. */
  squareThumbnail(dataUrl: string, size: number): Promise<string | null>;
}

/** Resolves which provider/model/key a build uses (BYOK vault keys or dodi AI). */
export interface ExecutionResolver {
  resolveGame(): Promise<ResolvedExecution | null>;
  resolveImage(): Promise<ResolvedExecution | null>;
  /**
   * Refetch managed (dodi AI) inference keys after a provider 401. Absent ⇒ a
   * rejected key fails the build as before.
   */
  refreshKeys?(): Promise<void>;
}

/** One build's renderer for the visual check. */
export interface BuildRenderer {
  viewGame(input: RenderGameInput): Promise<RenderGameOutput | null>;
  /**
   * A failed render was dodi's own screenshot service being unavailable. The
   * studio already says so elsewhere, so the build skips its own notice.
   */
  wasServiceUnavailable(): boolean;
}

export interface ScreenshotPort {
  /** The renderer for a new build, or null when no screenshot service resolves. */
  forBuild(): BuildRenderer | null;
}

/** The platform API (a `DodiClient` satisfies this). */
export interface StudioApi {
  request(path: string, init?: RequestInit): Promise<Response>;
}

/** Client caches of decrypted game rows (the web `useGameStore`). */
export interface GameCache {
  put(row: Game): void;
  patchLocal(gameId: string, patch: Partial<Game>): void;
}

export interface StudioErrorReport {
  context: ErrorLogContext;
  kidId: string | null;
  gameId: string | null;
  provider?: string;
  model?: string;
  error: unknown;
  /** Values that must never appear in the report (the provider key). */
  secrets: string[];
  /** Content-free diagnostics. The client adds its own environment facts. */
  meta?: ErrorLogMeta;
}

/** Fire-and-forget reporting; implementations never throw. */
export interface StudioTelemetry {
  reportUsage(report: UsageReport): void;
  reportError(report: StudioErrorReport): void;
}

/**
 * Device-local storage for sealed build checkpoints, one per game. Values are
 * already sealed under the vault; they never leave the device.
 */
export interface CheckpointStore {
  save(gameId: string, sealed: string): Promise<void>;
  load(gameId: string): Promise<string | null>;
  clear(gameId: string): Promise<void>;
}

export interface StudioPorts {
  api: StudioApi;
  /** Resolves once the vault is unlocked; rejects when it can't be. */
  session(): Promise<VaultSession>;
  images: ImageOps;
  execution: ExecutionResolver;
  screenshots: ScreenshotPort;
  telemetry: StudioTelemetry;
  games: GameCache;
  /** Absent ⇒ builds are not resumable on this client. */
  checkpoints?: CheckpointStore;
  now?: () => number;
}

/** The game cache as the studio editor uses it (the web `useGameStore`). */
export interface EditorGameCache extends GameCache {
  /** Drop every cached list, so the next read refetches (a new row exists). */
  invalidate(): void;
}

/**
 * What the studio editor's own actions (plan turns, settings save, versions,
 * the active toggle) need from a client. A subset of `StudioPorts` plus the
 * synchronous vault read: sealing the transcript and the Plan-step envelope
 * is skipped (or clears) while the vault is locked, it never waits for it.
 */
export interface StudioEditorPorts {
  api: StudioApi;
  /** Resolves once the vault is unlocked; rejects when it can't be. Seals/opens game fields. */
  session(): Promise<VaultSession>;
  /** The vault session right now, or null while locked. */
  currentSession(): VaultSession | null;
  execution: ExecutionResolver;
  telemetry: StudioTelemetry;
  games: EditorGameCache;
  now?: () => number;
}
