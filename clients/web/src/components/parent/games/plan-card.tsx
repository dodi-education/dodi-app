"use client";

import type { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/parent/games/rich-text";

type Translate = ReturnType<typeof useTranslations>;

interface PlanEditToggleProps {
  isEditingPlan: boolean;
  onToggleEdit: () => void;
  disabled?: boolean;
  t: Translate;
}

/** The ghost Modify / Done switch of the plan card. */
export function PlanEditToggle({ isEditingPlan, onToggleEdit, disabled, t }: PlanEditToggleProps) {
  return (
    <Button variant="ghost" size="sm" onClick={onToggleEdit} disabled={disabled}>
      <Icon name={isEditingPlan ? "check" : "edit"} size={14} />
      {t(isEditingPlan ? "planDoneEditing" : "planModify")}
    </Button>
  );
}

export interface PlanCardProps {
  planDraft: string;
  isEditingPlan: boolean;
  onPlanDraftChange: (text: string) => void;
  onToggleEdit: () => void;
  onAccept: () => void;
  onSkip: () => void;
  onPersonalize: () => void;
  /** An agent turn is running: every action that would start another is off. */
  isBusy: boolean;
  isDerivingSettings: boolean;
  /**
   * "stage": the desktop plan box, with its own heading row and a capped,
   * scrolling body. "surface": the mobile fullscreen view, where the surface
   * header carries the heading and the surface itself scrolls.
   */
  layout: "stage" | "surface";
  t: Translate;
}

/**
 * The plan on the table: what dodi proposed, what the parent edits and
 * approves. Shared by the desktop Plan step and the mobile plan surface.
 */
export function PlanCard({
  planDraft,
  isEditingPlan,
  onPlanDraftChange,
  onToggleEdit,
  onAccept,
  onSkip,
  onPersonalize,
  isBusy,
  isDerivingSettings,
  layout,
  t,
}: PlanCardProps) {
  const hasPlan = planDraft.trim().length > 0;
  const isStage = layout === "stage";

  return (
    <>
      <div className={isStage ? "flex flex-col gap-2.5 border-t border-border pt-4" : "flex flex-col gap-2.5"}>
        {isStage && (
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">{t("planCardTitle")}</h3>
            {hasPlan && (
              <PlanEditToggle
                isEditingPlan={isEditingPlan}
                onToggleEdit={onToggleEdit}
                disabled={isDerivingSettings}
                t={t}
              />
            )}
          </div>
        )}

        {!hasPlan ? (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t("planCardEmpty")}
          </p>
        ) : isEditingPlan ? (
          <textarea
            value={planDraft}
            onChange={(e) => onPlanDraftChange(e.target.value)}
            rows={isStage ? 16 : 14}
            aria-label={t("planCardTitle")}
            className="w-full resize-y rounded-lg border border-border-strong bg-background p-3 text-[13px] leading-relaxed text-ink outline-none focus:border-primary"
          />
        ) : (
          <div
            className={
              isStage
                ? "max-h-[42vh] overflow-y-auto pr-1 text-[13px] leading-[1.6] text-ink"
                : "text-[13px] leading-[1.6] text-ink"
            }
          >
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
    </>
  );
}
