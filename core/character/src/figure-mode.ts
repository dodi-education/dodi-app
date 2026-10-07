/**
 * Which companion figure a view shows: the 2D artwork or the 3D character,
 * decided before anything shows, so a view never swaps one for the other
 * (web: components/dodi/dodi-figure, app: components/dodi/dodi-full-home).
 * Until it is decided the view keeps the figure's box empty.
 */
export type FigureMode = "pending" | "2d" | "3d";

export interface FigureModeInput {
  /** The account's 3D setting; null while the account has not loaded. */
  is3dEnabled: boolean | null;
  /** The 3D character's load (model, renderer); "failed" also covers a GL failure later on. */
  load: "loading" | "ready" | "failed";
  /** Time since the view mounted. */
  elapsedMs: number;
  /** The mode this view decided last ("pending" before the first decision). */
  previous: FigureMode;
}

/**
 * How long a view waits for the 3D character before settling on the 2D
 * figure. A later mount, with the character loaded by then, shows 3D at once.
 */
export const FIGURE_DECISION_BUDGET_MS = 2500;

export function decideFigureMode({ is3dEnabled, load, elapsedMs, previous }: FigureModeInput): FigureMode {
  // Switched off, or 3D cannot show: the 2D figure (even after 3D was shown).
  if (is3dEnabled === false || load === "failed") return "2d";
  // A decision stands: no 2D → 3D swap; 3D stays while it works.
  if (previous !== "pending") return previous;
  if (is3dEnabled === true && load === "ready") return "3d";
  // Still waiting for the setting or the character: 2D once the budget is spent.
  return elapsedMs >= FIGURE_DECISION_BUDGET_MS ? "2d" : "pending";
}
