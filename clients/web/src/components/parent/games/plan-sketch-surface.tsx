"use client";

import type { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { PlanSurfaceHeader } from "@/components/parent/games/plan-surface-header";
import { SKETCH_TOOLBAR_HEIGHT, SketchPad } from "@/components/parent/games/sketch-pad";
import type { SketchStroke } from "@/components/parent/games/sketch-strokes";
import { STAGE } from "@/lib/games/stage";

/** Vertical padding around the pad, in px (p-2 top + bottom). */
const PAD_INSET = 16;

interface PlanSketchSurfaceProps {
  strokes: SketchStroke[];
  onStrokesChange: (next: SketchStroke[]) => void;
  onChange: (dataUrl: string | null) => void;
  /** Stage the sketch in the composer, with its request as the message. */
  onAttach: () => void;
  onBack: () => void;
  isBusy: boolean;
  t: ReturnType<typeof useTranslations>;
}

/**
 * The mobile sketch surface: the sketch pad takes over the chat thread while
 * the composer stays where it is, so a parent can draw and keep talking.
 *
 * The pad is sized off the space left under the header: the wrapper is a size
 * container, so the 4:5 canvas derives its width from that height and never
 * pushes the composer off the screen.
 */
export function PlanSketchSurface({
  strokes,
  onStrokesChange,
  onChange,
  onAttach,
  onBack,
  isBusy,
  t,
}: PlanSketchSurfaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanSurfaceHeader
        title={t("planDrawSketch")}
        backLabel={t("planBack")}
        onBack={onBack}
        right={
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={onAttach}
            disabled={strokes.length === 0 || isBusy}
          >
            <Icon name="photo" size={14} />
            {t("planAttachSketch")}
          </Button>
        }
      />
      {/* A size container: the canvas takes the height left under the header
          and derives its 4:5 width from it, or the full width when that is the
          tighter limit. Centered, so leftover space falls on both sides. */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 [container-type:size]">
        <SketchPad
          strokes={strokes}
          onStrokesChange={onStrokesChange}
          onChange={onChange}
          className="shrink-0"
          style={{
            width: `min(100%, calc((100cqh - ${SKETCH_TOOLBAR_HEIGHT + PAD_INSET}px) * ${STAGE.aspectW} / ${STAGE.aspectH}))`,
          }}
          labels={{
            color: t("sketchColor"),
            thin: t("sketchThin"),
            thick: t("sketchThick"),
            eraser: t("sketchEraser"),
            undo: t("sketchUndo"),
            clear: t("sketchClear"),
            canvas: t("sketchCanvas"),
          }}
        />
      </div>
    </div>
  );
}
