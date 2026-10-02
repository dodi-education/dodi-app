import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import { planCard } from "@dodi/ui-recipes";

import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

import { RichText } from "./rich-text";

interface PlanEditToggleProps {
  isEditingPlan: boolean;
  onToggleEdit: () => void;
  disabled?: boolean;
}

/** The ghost Modify / Done switch of the plan card. */
export function PlanEditToggle({ isEditingPlan, onToggleEdit, disabled }: PlanEditToggleProps) {
  const t = useTranslations("gameStudio");
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={isEditingPlan ? "check" : "edit"}
      onPress={onToggleEdit}
      disabled={disabled}
    >
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
}

/**
 * The plan on the table: what dodi proposed, what the parent edits and
 * approves (the web's PlanCard in its phone "surface" layout, where the
 * surface header carries the heading and the surface itself scrolls).
 */
export function PlanCard({
  planDraft,
  isEditingPlan,
  onPlanDraftChange,
  onAccept,
  onSkip,
  onPersonalize,
  isBusy,
  isDerivingSettings,
}: PlanCardProps) {
  const t = useTranslations("gameStudio");
  const [isFocused, setIsFocused] = useState(false);
  const hasPlan = planDraft.trim().length > 0;
  const editorClasses = cn(planCard.editor, planCard.editorText, isFocused && planCard.editorFocused);

  return (
    <>
      <View className={planCard.section}>
        {!hasPlan ? (
          <Text className={planCard.empty}>{t("planCardEmpty")}</Text>
        ) : isEditingPlan ? (
          <TextInput
            value={planDraft}
            onChangeText={onPlanDraftChange}
            multiline
            numberOfLines={14}
            textAlignVertical="top"
            accessibilityLabel={t("planCardTitle")}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={editorClasses}
            // 14 rows of 13px text at leading-relaxed, as the web's rows={14}.
            style={{ fontFamily: fontFamilyFor(editorClasses), minHeight: 14 * 21 + 24 }}
            placeholderTextColor={COLORS.faint}
          />
        ) : (
          <RichText text={planDraft} textClassName={planCard.bodyText} />
        )}

        {hasPlan && !isEditingPlan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy }}
            onPress={onPersonalize}
            disabled={isBusy}
            className={cn(planCard.personalize, isBusy && planCard.personalizeDisabled, "active:bg-primary-soft")}
          >
            <Icon name="sparkles" size={14} color="primary" />
            <Text className={cn(planCard.personalizeText, "shrink")}>{t("planChipPersonalize")}</Text>
          </Pressable>
        ) : null}
      </View>

      <View className={planCard.actions}>
        <Button
          size="lg"
          className="w-full"
          icon="check"
          isLoading={isDerivingSettings}
          onPress={onAccept}
          disabled={!hasPlan || isBusy || isDerivingSettings}
        >
          {t(isDerivingSettings ? "planAccepting" : "planAccept")}
        </Button>
        <Button variant="ghost" className="w-full" onPress={onSkip} disabled={isDerivingSettings}>
          {t("planSkip")}
        </Button>
      </View>
    </>
  );
}
