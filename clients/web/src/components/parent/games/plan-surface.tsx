"use client";

import { PlanCard, PlanEditToggle, type PlanCardProps } from "@/components/parent/games/plan-card";
import { PlanSurfaceHeader } from "@/components/parent/games/plan-surface-header";
import { cn } from "@/lib/utils";
import { planSurface } from "@dodi/ui-recipes";

interface PlanSurfaceProps extends Omit<PlanCardProps, "layout"> {
  onBack: () => void;
}

/**
 * The mobile plan surface: the plan dodi proposed, full screen over the chat
 * thread, with the composer still below so the parent can ask for a change.
 */
export function PlanSurface({ onBack, ...card }: PlanSurfaceProps) {
  const { planDraft, isEditingPlan, onToggleEdit, isDerivingSettings, t } = card;
  const hasPlan = planDraft.trim().length > 0;

  return (
    <div className={cn(planSurface.webRoot, planSurface.root)}>
      <PlanSurfaceHeader
        title={t("planCardTitle")}
        backLabel={t("planBack")}
        onBack={onBack}
        right={
          hasPlan ? (
            <PlanEditToggle
              isEditingPlan={isEditingPlan}
              onToggleEdit={onToggleEdit}
              disabled={isDerivingSettings}
              t={t}
            />
          ) : undefined
        }
      />
      <div className={cn(planSurface.body, planSurface.bodyPadding, planSurface.webBody)}>
        {/* Reading width on a wide stage; the full width on a phone. */}
        <div className={cn(planSurface.webColumn, planSurface.column)}>
          <PlanCard {...card} layout="surface" />
        </div>
      </div>
    </div>
  );
}
