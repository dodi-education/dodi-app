import { Pressable, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import type { PlanSurface } from "@dodi/studio/studio-panes";
import { chatWelcome, planActionBar, planPill, studioActionRow } from "@dodi/ui-recipes";

import { Button, Icon, type IconName, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

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
}

/** A full-width choice with an icon: the starters, the Plan step's empty state, the image sheet. */
export function ActionRow({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      className={cn(studioActionRow.box, disabled && studioActionRow.disabled, "active:bg-primary-soft")}
    >
      <Icon name={icon} size={studioActionRow.icon.size} color="primary" />
      <Text className={cn(studioActionRow.text, "shrink")}>{label}</Text>
    </Pressable>
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
}: PlanActionsProps) {
  const t = useTranslations("gameStudio");
  return (
    <>
      {!needsGameProvider ? (
        <View className={chatWelcome.list}>
          <ActionRow icon="sparkles" label={t("planStarterIdea")} onPress={onIdea} disabled={isBusy} />
          <ActionRow icon="pencil" label={t("planDrawSketch")} onPress={onDrawSketch} />
          <ActionRow icon="camera" label={t("planTakePhoto")} onPress={onTakePhoto} disabled={isBusy} />
          {/* Only after /clear: the conversation is gone, the plan is not. */}
          {hasPlan ? <ActionRow icon="book" label={t("planCardTitle")} onPress={onOpenPlan} /> : null}
        </View>
      ) : null}
      <Button variant="ghost" size="sm" className="mt-3" onPress={onSkip} disabled={isDerivingSettings}>
        {t("planSkip")}
      </Button>
    </>
  );
}

function Pill({
  icon,
  label,
  onPress,
  disabled,
  highlighted,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(highlighted) }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={cn(planPill.box, highlighted ? planPill.on : planPill.off, disabled && planPill.disabled)}
    >
      <Icon name={icon} size={planPill.icon.size} color={highlighted ? "primary" : "muted-foreground"} />
      <Text className={cn(planPill.text, highlighted ? planPill.onText : planPill.offText)}>{label}</Text>
    </Pressable>
  );
}

interface PlanActionRowProps extends Omit<PlanActionsProps, "onIdea"> {
  /** The surface on screen right now, so its pill reads as pressed. */
  activeSurface: PlanSurface;
  /** A phone's row has no room for full labels: "Draw", "Photo". */
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
}: PlanActionRowProps) {
  const t = useTranslations("gameStudio");
  return (
    <View className={planActionBar.box}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={cn(planActionBar.content, "flex-grow")}
      >
        {hasPlan ? (
          <Pill
            icon="book"
            label={t("planCardTitle")}
            onPress={onOpenPlan}
            highlighted={activeSurface === "plan"}
          />
        ) : null}
        {!needsGameProvider ? (
          <>
            <Pill
              icon="pencil"
              label={t(compact ? "planDraw" : "planDrawSketch")}
              onPress={onDrawSketch}
              highlighted={activeSurface === "sketch"}
            />
            <Pill
              icon="camera"
              label={t(compact ? "planPhoto" : "planTakePhoto")}
              onPress={onTakePhoto}
              disabled={isBusy}
            />
          </>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onPress={onSkip}
          disabled={isDerivingSettings}
        >
          {t("planSkip")}
        </Button>
      </ScrollView>
    </View>
  );
}
