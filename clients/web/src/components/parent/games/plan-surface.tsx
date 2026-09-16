"use client";

import { PlanCard, PlanEditToggle, type PlanCardProps } from "@/components/parent/games/plan-card";
import { PlanSurfaceHeader } from "@/components/parent/games/plan-surface-header";

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
    <div className="flex min-h-0 flex-1 flex-col">
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* Reading width on a wide stage; the full width on a phone. */}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <PlanCard {...card} layout="surface" />
        </div>
      </div>
    </div>
  );
}
