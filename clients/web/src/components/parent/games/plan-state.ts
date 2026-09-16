/**
 * The studio's Plan step, as persisted.
 *
 * The first brainstorming turn creates the game row, and from then on the
 * Plan step's state rides along in `games.plan_enc`: an enc:v1: JSON envelope
 * of this shape, sealed under the account vault key like the transcript. The
 * column doubles as the stage marker: a row with a non-null `plan_enc` is
 * still being planned, so the studio reopens on the Plan step (or on the
 * settings, once the plan was accepted) and the build chat stays locked.
 * Saving the settings ends planning and clears it.
 *
 * Kept pure (no React, no store) so the envelope's shape and the reopen rules
 * are testable in node.
 */

import type { SketchStroke } from "@/components/parent/games/sketch-strokes";
import type { StudioView } from "@/components/parent/games/game-studio";

export interface PlanningState {
  /** The plan on the table: dodi's latest proposal, as the parent last edited it. */
  summary: string;
  /** The parent accepted the plan and moved on to the settings; saving builds it. */
  isAccepted: boolean;
  /** Which inspiration surface the parent last used. */
  mode: "draw" | "photo";
  /** PNG data URL of the sketch (null = nothing drawn). */
  sketchImage: string | null;
  /** Downscaled JPEG data URL of the photographed task (null = none). */
  photoImage: string | null;
  /** The sketch's strokes, so the pad reopens editable rather than as a flat image. */
  sketchStrokes: SketchStroke[];
}

export const EMPTY_PLANNING: PlanningState = {
  summary: "",
  isAccepted: false,
  mode: "draw",
  sketchImage: null,
  photoImage: null,
  sketchStrokes: [],
};

/** The slice of a VaultSession the restore needs (keeps tests free of crypto). */
interface Unsealer {
  decryptJson<T>(stored: string | null | undefined): T | null;
}

function isStroke(value: unknown): value is SketchStroke {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.color === "string" &&
    typeof s.width === "number" &&
    typeof s.isEraser === "boolean" &&
    Array.isArray(s.points)
  );
}

/**
 * Unseal a persisted Plan-step envelope. Anything that is not a well-formed
 * envelope (no column, locked vault, wrong key, a malformed blob) yields null,
 * which the studio treats as "not planning": a stale or corrupt envelope must
 * never trap a game on the Plan step.
 */
export function restorePlanning(
  enc: string | null | undefined,
  session: Unsealer | null,
): PlanningState | null {
  if (!enc || !session) return null;
  let raw: unknown;
  try {
    raw = session.decryptJson<unknown>(enc);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.summary !== "string") return null;
  return {
    summary: r.summary,
    isAccepted: r.isAccepted === true,
    mode: r.mode === "photo" ? "photo" : "draw",
    sketchImage: typeof r.sketchImage === "string" ? r.sketchImage : null,
    photoImage: typeof r.photoImage === "string" ? r.photoImage : null,
    sketchStrokes: Array.isArray(r.sketchStrokes) ? r.sketchStrokes.filter(isStroke) : [],
  };
}

/** What the stage can show: the three tabs, plus the Plan step while planning. */
export type DraftView = StudioView | "plan";

export interface InitialViewInput {
  /** Tab from the route, if the URL named one. */
  initialView?: StudioView;
  /** The row exists (an existing game, or a persisted planning draft). */
  hasId: boolean;
  /** The restored Plan-step envelope, or null when the game is past planning. */
  planning: PlanningState | null;
}

/**
 * Where the studio opens. A deep link to a tab wins. A planning draft reopens
 * where the parent left off: the Plan step, or the settings once the plan was
 * accepted (saving them is what starts the build). Past planning, an existing
 * game opens on its preview and a brand-new one on the Plan step.
 */
export function resolveInitialView({ initialView, hasId, planning }: InitialViewInput): DraftView {
  if (initialView) return initialView;
  if (planning) return planning.isAccepted ? "settings" : "plan";
  return hasId ? "preview" : "plan";
}
