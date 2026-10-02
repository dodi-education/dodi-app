import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import { STAGE } from "@dodi/games/stage";
import type { SketchStroke } from "@dodi/studio/sketch-strokes";
import { planSurface, sketchPad } from "@dodi/ui-recipes";

import { Button } from "@/components/ui";

import { PlanSurfaceHeader } from "./plan-surface-header";
import { SketchPad } from "./sketch-pad";

/** Padding around the pad, in pt (p-2 on each side). */
const PAD_INSET = 16;

interface PlanSketchSurfaceProps {
  strokes: SketchStroke[];
  onStrokesChange: (next: SketchStroke[]) => void;
  onChange: (dataUrl: string | null) => void;
  /** Stage the sketch in the composer, with its request as the message. */
  onAttach: () => void;
  onBack: () => void;
  isBusy: boolean;
}

/**
 * The sketch surface: the sketch pad takes over the chat thread while the
 * composer stays where it is, so a parent can draw and keep talking. The pad
 * is sized off the space left under the header: the 4:5 canvas derives its
 * width from that height, or takes the full width when that is the tighter
 * limit (the web does this with a size container).
 */
export function PlanSketchSurface({
  strokes,
  onStrokesChange,
  onChange,
  onAttach,
  onBack,
  isBusy,
}: PlanSketchSurfaceProps) {
  const t = useTranslations("gameStudio");
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const width = area
    ? Math.max(
        0,
        Math.min(
          area.width - PAD_INSET,
          ((area.height - PAD_INSET - sketchPad.toolbarHeight) * STAGE.aspectW) / STAGE.aspectH,
        ),
      )
    : 0;

  return (
    <View className={planSurface.root}>
      <PlanSurfaceHeader
        title={t("planDrawSketch")}
        backLabel={t("planBack")}
        onBack={onBack}
        right={
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            icon="photo"
            onPress={onAttach}
            disabled={strokes.length === 0 || isBusy}
          >
            {t("planAttachSketch")}
          </Button>
        }
      />
      <View
        className={planSurface.sketchArea}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setArea((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }));
        }}
      >
        {width > 0 ? (
          <SketchPad
            strokes={strokes}
            onStrokesChange={onStrokesChange}
            onChange={onChange}
            width={width}
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
        ) : null}
      </View>
    </View>
  );
}
