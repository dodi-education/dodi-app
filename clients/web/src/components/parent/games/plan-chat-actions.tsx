"use client";

import type { useTranslations } from "next-intl";

import { Icon, type IconName } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import type { PlanSurface } from "@dodi/studio/studio-panes";
import { cn } from "@/lib/utils";
import { chatWelcome, planActionBar, planPill, studioActionRow } from "@dodi/ui-recipes";

type Translate = ReturnType<typeof useTranslations>;

interface PlanActionsProps {
  /** A plan is on the table, so it can be opened. */
  hasPlan: boolean;
  onIdea: () => void;
  onDrawSketch: () => void;
  onTakePhoto: () => void;
  onOpenPlan: () => void;
  onSkip: () => void;
  /** An agent turn is running: anything that would start another is off. */
  isBusy: boolean;
  isDerivingSettings: boolean;
  /** No game model configured: the sends are off, the exits stay. */
  needsGameProvider: boolean;
  t: Translate;
}

/** A full-width choice with an icon: the rows of the Plan step's empty state
 *  and of the reference-image sheet. */
export function ActionRow({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        studioActionRow.box,
        studioActionRow.text,
        studioActionRow.web,
        studioActionRow.webDisableable,
      )}
    >
      <Icon name={icon} size={14} className="shrink-0 text-primary" />
      {label}
    </button>
  );
}

/**
 * How a parent starts the Plan step on a phone: talk it through, draw the
 * screen they imagine, or photograph the worksheet their child is working on.
 */
export function PlanEmptyActions({
  hasPlan,
  onIdea,
  onDrawSketch,
  onTakePhoto,
  onOpenPlan,
  onSkip,
  isBusy,
  isDerivingSettings,
  needsGameProvider,
  t,
}: PlanActionsProps) {
  return (
    <>
      {!needsGameProvider && (
        <div className={cn(chatWelcome.webList, chatWelcome.list)}>
          <ActionRow
            icon="sparkles"
            label={t("planStarterIdea")}
            onClick={onIdea}
            disabled={isBusy}
          />
          <ActionRow icon="pencil" label={t("planDrawSketch")} onClick={onDrawSketch} />
          <ActionRow
            icon="camera"
            label={t("planTakePhoto")}
            onClick={onTakePhoto}
            disabled={isBusy}
          />
          {/* Only after /clear: the conversation is gone, the plan is not. */}
          {hasPlan && (
            <ActionRow icon="book" label={t("planCardTitle")} onClick={onOpenPlan} />
          )}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={onSkip}
        disabled={isDerivingSettings}
      >
        {t("planSkip")}
      </Button>
    </>
  );
}

function Pill({
  icon,
  label,
  onClick,
  disabled,
  highlighted,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        planPill.box,
        planPill.text,
        planPill.web,
        highlighted ? cn(planPill.on, planPill.onText) : cn(planPill.off, planPill.offText),
      )}
    >
      <Icon name={icon} size={planPill.icon.size} />
      {label}
    </button>
  );
}

interface PlanActionRowProps extends Omit<PlanActionsProps, "onIdea"> {
  /** The surface on screen right now, so its pill reads as pressed. */
  activeSurface: PlanSurface;
  /** A phone's row has no room for full labels: "Draw" instead of "Draw a
   *  sketch", "Photo" instead of "Take a photo". */
  compact: boolean;
}

/**
 * The Plan step's controls once the conversation has started: the plan itself,
 * the two inspiration surfaces, and the way out of planning. Pinned under the
 * chat header so they stay reachable while the thread scrolls.
 */
export function PlanActionRow({
  hasPlan,
  activeSurface,
  compact,
  onDrawSketch,
  onTakePhoto,
  onOpenPlan,
  onSkip,
  isBusy,
  isDerivingSettings,
  needsGameProvider,
  t,
}: PlanActionRowProps) {
  return (
    <div className={cn(planActionBar.web, planActionBar.box, planActionBar.content)}>
      {hasPlan && (
        <Pill
          icon="book"
          label={t("planCardTitle")}
          onClick={onOpenPlan}
          highlighted={activeSurface === "plan"}
        />
      )}
      {!needsGameProvider && (
        <>
          <Pill
            icon="pencil"
            label={t(compact ? "planDraw" : "planDrawSketch")}
            onClick={onDrawSketch}
            highlighted={activeSurface === "sketch"}
          />
          <Pill
            icon="camera"
            label={t(compact ? "planPhoto" : "planTakePhoto")}
            onClick={onTakePhoto}
            disabled={isBusy}
          />
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto shrink-0"
        onClick={onSkip}
        disabled={isDerivingSettings}
      >
        {t("planSkip")}
      </Button>
    </div>
  );
}
