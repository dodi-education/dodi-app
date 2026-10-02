import { ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import { planSurface } from "@dodi/ui-recipes";

import { PlanCard, type PlanCardProps, PlanEditToggle } from "./plan-card";
import { PlanSurfaceHeader } from "./plan-surface-header";

interface PlanSurfaceProps extends PlanCardProps {
  onBack: () => void;
}

/**
 * The plan surface: the plan dodi proposed, full screen over the chat thread,
 * with the composer still below so the parent can ask for a change.
 */
export function PlanSurface({ onBack, ...card }: PlanSurfaceProps) {
  const t = useTranslations("gameStudio");
  const { planDraft, isEditingPlan, onToggleEdit, isDerivingSettings } = card;
  const hasPlan = planDraft.trim().length > 0;

  return (
    <View className={planSurface.root}>
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
            />
          ) : undefined
        }
      />
      <ScrollView
        className={planSurface.body}
        contentContainerClassName={planSurface.bodyPadding}
        keyboardShouldPersistTaps="handled"
      >
        <View className={planSurface.column}>
          <PlanCard {...card} />
        </View>
      </ScrollView>
    </View>
  );
}
