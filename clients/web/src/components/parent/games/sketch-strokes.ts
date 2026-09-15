/**
 * Pure stroke model for the studio's sketch pad.
 *
 * Kept out of the React component so the drawing maths is testable in node:
 * the component only owns the canvas element, pointer plumbing and the PNG
 * export. Coordinates are in the game canvas's logical space (see STAGE), so a
 * sketch maps 1:1 onto the frame the built game is rendered in.
 */

import { STAGE } from "@dodi/games/stage";

export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchStroke {
  /** CSS color; ignored for eraser strokes. */
  color: string;
  width: number;
  isEraser: boolean;
  points: SketchPoint[];
}

/** Pen palette: ink, blue, red, green, amber. */
export const SKETCH_COLORS = ["#22384e", "#2563eb", "#dc2626", "#16a34a", "#f59e0b"] as const;

export const SKETCH_WIDTHS = { thin: 3, thick: 9 } as const;

/** The sketch surface = the game canvas's design reference size (portrait 4:5). */
export const SKETCH_SIZE = {
  width: STAGE.logicalWidth,
  height: STAGE.logicalHeight,
} as const;

/** Points closer than this add nothing but cost — drop them. */
const MIN_POINT_DISTANCE = 1.5;

/**
 * Append a point to a stroke unless it is too close to the previous one.
 * Returns the same stroke reference when nothing changed, so callers can skip
 * a redraw cheaply.
 */
export function appendPoint(
  stroke: SketchStroke,
  point: SketchPoint,
  minDistance = MIN_POINT_DISTANCE,
): SketchStroke {
  const last = stroke.points[stroke.points.length - 1];
  if (last) {
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (Math.hypot(dx, dy) < minDistance) return stroke;
  }
  return { ...stroke, points: [...stroke.points, point] };
}

/** Drop the most recent stroke (undo). */
export function undoStroke(strokes: SketchStroke[]): SketchStroke[] {
  return strokes.slice(0, -1);
}

/** The 2D-context surface `renderStrokes` needs — structural, so tests can fake it. */
export interface StrokeCanvas {
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  globalCompositeOperation: GlobalCompositeOperation;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

/**
 * Draw every stroke onto a context whose origin is the sketch's top-left.
 * `scale` converts logical coordinates to the target's pixels (1 for the
 * export canvas, devicePixelRatio-adjusted for the on-screen one).
 *
 * A single-point stroke (a tap) is drawn as a zero-length line, which with a
 * round cap renders as the dot the parent expects.
 */
export function renderStrokes(ctx: StrokeCanvas, strokes: SketchStroke[], scale = 1): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    // Erasing cuts back to the white base rather than painting white over it,
    // so the export stays clean whatever order strokes were drawn in.
    ctx.globalCompositeOperation = stroke.isEraser ? "destination-out" : "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * scale;
    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    ctx.moveTo(first.x * scale, first.y * scale);
    if (rest.length === 0) {
      ctx.lineTo(first.x * scale, first.y * scale);
    } else {
      for (const point of rest) ctx.lineTo(point.x * scale, point.y * scale);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}
