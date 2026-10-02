"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/shared/icon";
import { STAGE_ASPECT_CSS } from "@dodi/games/stage";
import { cn } from "@/lib/utils";
import { sketchPad } from "@dodi/ui-recipes";

import {
  appendPoint,
  renderStrokes,
  SKETCH_COLORS,
  SKETCH_SIZE,
  SKETCH_WIDTHS,
  type SketchStroke,
  undoStroke,
} from "@dodi/studio/sketch-strokes";

export interface SketchPadLabels {
  color: string;
  thin: string;
  thick: string;
  eraser: string;
  undo: string;
  clear: string;
  canvas: string;
}

/** Height of the toolbar row above the canvas, in px. Callers that size the pad
 *  to a height budget subtract it so the 4:5 canvas still fits. */
export const SKETCH_TOOLBAR_HEIGHT = sketchPad.toolbarHeight;

interface SketchPadProps {
  /** The committed strokes. Held by the caller so a drawing survives the pad
   *  being unmounted (mobile surface toggle, orientation change). */
  strokes: SketchStroke[];
  onStrokesChange: (next: SketchStroke[]) => void;
  /** Fires on every committed change: a PNG data URL, or null once emptied. */
  onChange: (dataUrl: string | null) => void;
  labels: SketchPadLabels;
  /** Applied to the card (toolbar + canvas); size it from the outside. */
  className?: string;
  style?: React.CSSProperties;
}

/** Render `strokes` onto a fresh white canvas and return it as a PNG data URL. */
function exportPng(strokes: SketchStroke[]): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SKETCH_SIZE.width;
  canvas.height = SKETCH_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Line art on white: the plan agent reads shapes, and a transparent PNG
  // would reach it as black-on-black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderStrokes(ctx, strokes, 1);
  return canvas.toDataURL("image/png");
}

/**
 * Freehand sketch surface for the studio's Plan step: the parent draws the
 * screen they imagine and the plan agent reads the layout off it.
 *
 * Laid out like the kids' drawing game: a white card with the tool row on top
 * and the canvas below. The canvas is the game's own 4:5 frame, so what the
 * parent draws sits where it would sit in the built game. Strokes live in
 * logical coordinates and are re-rendered on resize, which keeps the drawing
 * crisp on any display.
 */
export function SketchPad({
  strokes,
  onStrokesChange,
  onChange,
  labels,
  className,
  style,
}: SketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState<string>(SKETCH_COLORS[0]);
  const [width, setWidth] = useState<number>(SKETCH_WIDTHS.thin);
  const [isErasing, setIsErasing] = useState(false);
  // The stroke being drawn right now — a ref so pointermove never re-renders.
  const liveRef = useRef<SketchStroke | null>(null);

  const paint = useCallback((committed: SketchStroke[], live: SketchStroke | null): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scale = canvas.width / SKETCH_SIZE.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    renderStrokes(ctx, live ? [...committed, live] : committed, scale);
  }, []);

  // Size the bitmap to the element's real pixels and repaint. Runs on mount and
  // whenever the pane resizes (sidebar drag, orientation change).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const next = Math.max(1, Math.round(canvas.clientWidth * dpr));
      if (canvas.width !== next) {
        canvas.width = next;
        canvas.height = Math.round(next * (SKETCH_SIZE.height / SKETCH_SIZE.width));
      }
      paint(strokes, liveRef.current);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint, strokes]);

  const commit = (next: SketchStroke[]): void => {
    onStrokesChange(next);
    onChange(next.length > 0 ? exportPng(next) : null);
  };

  /** Pointer position in the sketch's logical coordinate system. */
  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SKETCH_SIZE.width,
      y: ((e.clientY - rect.top) / rect.height) * SKETCH_SIZE.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    liveRef.current = {
      color,
      // An eraser needs to feel wider than the pen at the same setting.
      width: isErasing ? width * 3 : width,
      isEraser: isErasing,
      points: [toLogical(e)],
    };
    paint(strokes, liveRef.current);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const live = liveRef.current;
    if (!live) return;
    const next = appendPoint(live, toLogical(e));
    if (next === live) return;
    liveRef.current = next;
    paint(strokes, next);
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    commit([...strokes, live]);
  };

  const toolClass = (active: boolean): string =>
    cn(
      sketchPad.tool,
      sketchPad.webTool,
      active
        ? cn(sketchPad.toolOn, sketchPad.webToolOn)
        : cn(sketchPad.toolOff, sketchPad.webToolOff),
    );

  return (
    <div
      style={style}
      className={cn(
        sketchPad.webCard,
        sketchPad.card,
        className,
      )}
    >
      {/* Tool row — colors, pen sizes, then eraser / undo / clear at the end. */}
      <div
        style={{ height: SKETCH_TOOLBAR_HEIGHT }}
        className={cn(sketchPad.webToolbar, sketchPad.toolbar, sketchPad.toolbarContent)}
      >
        <div role="group" aria-label={labels.color} className={cn(sketchPad.webGroup, sketchPad.group)}>
          {SKETCH_COLORS.map((swatch) => {
            const selected = !isErasing && color === swatch;
            return (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={selected}
                onClick={() => {
                  setColor(swatch);
                  setIsErasing(false);
                }}
                className={cn(sketchPad.webSwatchButton, sketchPad.swatchButton)}
              >
                <span
                  className={cn(
                    sketchPad.swatch,
                    sketchPad.webSwatch,
                    selected && cn(sketchPad.swatchSelected, sketchPad.webSwatchSelected),
                  )}
                  style={{ backgroundColor: swatch }}
                />
              </button>
            );
          })}
        </div>

        <div role="group" aria-label={labels.thin} className={cn(sketchPad.webGroup, sketchPad.group)}>
          {[
            { value: SKETCH_WIDTHS.thin, label: labels.thin, dot: 5 },
            { value: SKETCH_WIDTHS.thick, label: labels.thick, dot: 11 },
          ].map((pen) => (
            <button
              key={pen.value}
              type="button"
              aria-label={pen.label}
              aria-pressed={width === pen.value}
              title={pen.label}
              onClick={() => setWidth(pen.value)}
              className={toolClass(width === pen.value)}
            >
              <span
                className={sketchPad.penDot}
                style={{ width: pen.dot, height: pen.dot, backgroundColor: isErasing ? "#94a3b8" : color }}
              />
            </button>
          ))}
        </div>

        <div className={cn(sketchPad.webGroup, sketchPad.groupEnd)}>
          <button
            type="button"
            onClick={() => setIsErasing((v) => !v)}
            aria-label={labels.eraser}
            aria-pressed={isErasing}
            title={labels.eraser}
            className={toolClass(isErasing)}
          >
            <Icon name="eraser" size={sketchPad.toolIcon.size} />
          </button>
          <button
            type="button"
            onClick={() => commit(undoStroke(strokes))}
            disabled={strokes.length === 0}
            aria-label={labels.undo}
            title={labels.undo}
            className={toolClass(false)}
          >
            <Icon name="undo" size={sketchPad.toolIcon.size} />
          </button>
          <button
            type="button"
            onClick={() => commit([])}
            disabled={strokes.length === 0}
            aria-label={labels.clear}
            title={labels.clear}
            className={cn(toolClass(false), sketchPad.webToolDanger)}
          >
            <Icon name="delete" size={sketchPad.toolIcon.size} />
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        aria-label={labels.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
        style={{ aspectRatio: STAGE_ASPECT_CSS, touchAction: "none" }}
        className={cn(sketchPad.canvas, sketchPad.webCanvas)}
      />
    </div>
  );
}
