"use client";

import { useRef } from "react";
import type { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/parent/games/rich-text";
import { SKETCH_TOOLBAR_HEIGHT, SketchPad } from "@/components/parent/games/sketch-pad";
import { STAGE } from "@/lib/games/stage";
import { STAGE_ASPECT_CSS } from "@dodi/games/stage";
import { cn } from "@/lib/utils";

/** Which inspiration surface the parent is working on. */
export type PlanMode = "draw" | "photo";

interface PlanStageProps {
  mode: PlanMode;
  onModeChange: (mode: PlanMode) => void;
  sketchImage: string | null;
  photoImage: string | null;
  onSketchChange: (dataUrl: string | null) => void;
  onPhotoPicked: (file: File) => void;
  onRemovePhoto: () => void;
  /** Ask dodi to read the current sketch/photo and propose a game from it. */
  onDescribeImage: () => void;
  planDraft: string;
  isEditingPlan: boolean;
  onPlanDraftChange: (text: string) => void;
  onToggleEdit: () => void;
  onAccept: () => void;
  onSkip: () => void;
  onPersonalize: () => void;
  /** An agent turn is running — every action that would start another is off. */
  isBusy: boolean;
  isDerivingSettings: boolean;
  t: ReturnType<typeof useTranslations>;
}

/** The card chrome shared by the sketch pad and the photo frame — the same
 *  look as the game stage, so the sketch reads as "the game, before it exists". */
const STAGE_CARD =
  "flex flex-col overflow-hidden rounded-[18px] border border-border bg-white shadow-[0_8px_28px_rgba(34,56,78,0.10)]";

/**
 * The studio's Plan step, laid out like the kids' play view: the plan box on
 * the left, and on the right a canvas the size of the real game stage where
 * the parent sketches the screen they imagine or drops in a photo of a task.
 * The conversation itself lives in the studio's chat sidebar.
 */
export function PlanStage({
  mode,
  onModeChange,
  sketchImage,
  photoImage,
  onSketchChange,
  onPhotoPicked,
  onRemovePhoto,
  onDescribeImage,
  planDraft,
  isEditingPlan,
  onPlanDraftChange,
  onToggleEdit,
  onAccept,
  onSkip,
  onPersonalize,
  isBusy,
  isDerivingSettings,
  t,
}: PlanStageProps) {
  // Two inputs, one handler: `capture` opens the camera on a phone or tablet
  // and is ignored on desktop, so the plain one stays for picking a file.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const hasPlan = planDraft.trim().length > 0;
  const hasImage = mode === "draw" ? Boolean(sketchImage) : Boolean(photoImage);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPhotoPicked(file);
  };

  // The canvas card matches the studio preview's height budget, minus its own
  // tool row, so the 4:5 surface is exactly as big as the game will be. The
  // columns are sized on the grid itself (plan box + canvas, nothing stretchy)
  // so the pair sits centered in the pane with the box pinned to the canvas.
  const reserved = STAGE.reservedStudio + SKETCH_TOOLBAR_HEIGHT;
  const layoutStyle = {
    "--plan-w": "450px",
    "--plan-gap": "1.5rem",
    "--stage-h": `max(${STAGE.minHeight}px, min(${STAGE.maxHeightDesktop}px, calc(100dvh - ${reserved}px)))`,
    // Side by side: never wider than the height budget allows, nor than what is
    // left next to the plan box. Stacked: the pane width alone is the limit.
    "--stage-w": `min(calc(100% - var(--plan-w) - var(--plan-gap)), calc(var(--stage-h) * ${STAGE.aspectW} / ${STAGE.aspectH}))`,
    "--stage-w-solo": `min(100%, calc(var(--stage-h) * ${STAGE.aspectW} / ${STAGE.aspectH}))`,
  } as React.CSSProperties;
  const stageClass = "mx-auto w-[var(--stage-w-solo)] lg:w-full";

  return (
    <div
      style={layoutStyle}
      className="grid gap-4 p-4 md:p-6 lg:grid-cols-[var(--plan-w)_var(--stage-w)] lg:justify-center lg:gap-[var(--plan-gap)]"
    >
      {/* Left: the plan box */}
      <div className="flex flex-col gap-4 self-start rounded-[18px] border border-border bg-card p-4 shadow-[0_4px_18px_rgba(34,56,78,0.07)]">
        <div>
          <h2 className="text-[16px] font-bold tracking-tight text-ink">{t("planTitle")}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("planIntro")}
          </p>
        </div>

        <div className="inline-flex w-full gap-0.5 rounded-[10px] border border-border bg-background p-[3px]">
          {(["draw", "photo"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-[7px] text-[13px] font-semibold transition-colors",
                mode === value
                  ? "bg-card text-ink shadow-[0_1px_2px_rgba(34,56,78,0.06)]"
                  : "text-muted-foreground hover:text-ink-2",
              )}
            >
              <Icon name={value === "draw" ? "pencil" : "camera"} size={15} />
              {t(value === "draw" ? "planDraw" : "planPhoto")}
            </button>
          ))}
        </div>

        {mode === "photo" && (
          <div className="flex flex-col gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onFileInput}
            />
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileInput}
            />
            <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
              <Icon name="camera" size={16} />
              {t("planTakePhoto")}
            </Button>
            <Button variant="outline" onClick={() => uploadInputRef.current?.click()}>
              <Icon name="upload" size={16} />
              {photoImage ? t("planReplaceImage") : t("planUploadPhoto")}
            </Button>
          </div>
        )}

        {hasImage && (
          <Button variant="secondary" onClick={onDescribeImage} disabled={isBusy}>
            <Icon name="sparkles" size={16} />
            {t(mode === "draw" ? "planDescribeSketch" : "planAnalyzePhoto")}
          </Button>
        )}

        {/* The plan: what dodi proposed, what the parent approves. */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">{t("planCardTitle")}</h3>
            {hasPlan && (
              <Button variant="ghost" size="sm" onClick={onToggleEdit} disabled={isDerivingSettings}>
                <Icon name={isEditingPlan ? "check" : "edit"} size={14} />
                {t(isEditingPlan ? "planDoneEditing" : "planModify")}
              </Button>
            )}
          </div>

          {!hasPlan ? (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {t("planCardEmpty")}
            </p>
          ) : isEditingPlan ? (
            <textarea
              value={planDraft}
              onChange={(e) => onPlanDraftChange(e.target.value)}
              rows={16}
              aria-label={t("planCardTitle")}
              className="w-full resize-y rounded-lg border border-border-strong bg-background p-3 text-[13px] leading-relaxed text-ink outline-none focus:border-primary"
            />
          ) : (
            <div className="max-h-[42vh] overflow-y-auto pr-1 text-[13px] leading-[1.6] text-ink">
              <RichText text={planDraft} />
            </div>
          )}

          {hasPlan && !isEditingPlan && (
            <button
              type="button"
              onClick={onPersonalize}
              disabled={isBusy}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-[12.5px] font-medium text-ink-2 transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="sparkles" size={14} className="shrink-0 text-primary" />
              {t("planChipPersonalize")}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Button
            size="lg"
            className="w-full"
            onClick={onAccept}
            disabled={!hasPlan || isBusy || isDerivingSettings}
          >
            <Icon
              name={isDerivingSettings ? "loading" : "check"}
              size={16}
              className={isDerivingSettings ? "animate-spin" : undefined}
            />
            {t(isDerivingSettings ? "planAccepting" : "planAccept")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onSkip} disabled={isDerivingSettings}>
            {t("planSkip")}
          </Button>
        </div>
      </div>

      {/* Right: the canvas, sized like the game stage */}
      <div className="min-w-0">
        {mode === "draw" ? (
          <SketchPad
            onChange={onSketchChange}
            className={stageClass}
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
        ) : (
          <div className={cn(STAGE_CARD, stageClass)}>
            <div
              style={{ height: SKETCH_TOOLBAR_HEIGHT }}
              className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4"
            >
              <span className="text-[13px] font-semibold text-ink-2">{t("planPhoto")}</span>
              {photoImage && (
                <button
                  type="button"
                  onClick={onRemovePhoto}
                  aria-label={t("planRemoveImage")}
                  title={t("planRemoveImage")}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-card text-muted-foreground transition-colors hover:border-danger hover:text-danger"
                >
                  <Icon name="delete" size={17} />
                </button>
              )}
            </div>
            <div
              style={{ aspectRatio: STAGE_ASPECT_CSS }}
              className="flex w-full items-center justify-center bg-white"
            >
              {photoImage ? (
                // Raw <img>: the photo is an in-memory data URL.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoImage}
                  alt={t("planPhotoAlt")}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="m-6 flex flex-1 flex-col items-center justify-center gap-3 self-stretch rounded-[14px] border-2 border-dashed border-border-strong px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background text-faint">
                    <Icon name="camera" size={28} />
                  </div>
                  <p className="max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
                    {t("planPhotoEmpty")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
