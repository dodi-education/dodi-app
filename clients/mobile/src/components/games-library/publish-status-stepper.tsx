import { View } from "react-native";
import { useTranslations } from "use-intl";
import {
  type PublishStepStatus,
  type PublishStepperState,
  publishStepStatuses,
} from "@dodi/client-state/game-publication";
import type { ColorToken } from "@dodi/design-tokens";
import { publishStepper as s } from "@dodi/ui-recipes";

import { Icon, type IconName, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

const DOT_BOX: Record<PublishStepStatus, string> = {
  done: s.done,
  current: cn(s.current, s.currentRing),
  warning: cn(s.current, s.currentRing),
  danger: cn(s.danger, s.dangerRing),
  upcoming: s.upcoming,
};

const DOT_TEXT: Record<PublishStepStatus, string> = {
  done: s.doneText,
  current: s.currentText,
  warning: s.currentText,
  danger: s.dangerText,
  upcoming: s.upcomingText,
};

const DOT_ICON: Partial<Record<PublishStepStatus, { name: IconName; color: ColorToken }>> = {
  done: { name: "check", color: "primary-foreground" },
  current: { name: "clock", color: "warning" },
  warning: { name: "alert", color: "warning" },
  danger: { name: "ban", color: "danger" },
};

/** Submitted → Safety review → Live (web: publish-status-stepper). */
export function PublishStatusStepper({ state }: { state: PublishStepperState }) {
  const t = useTranslations("gameStudio");
  const statuses = publishStepStatuses(state);
  const labels = [t("publishStepSubmitted"), t("publishStepReview"), t("publishStepLive")];

  return (
    <View className={s.list} accessibilityRole="list" accessibilityLabel={t("publishProgressLabel")}>
      {labels.map((label, i) => {
        const status = statuses[i];
        const icon = DOT_ICON[status];
        return (
          <View
            key={label}
            className={s.item}
            accessible
            accessibilityLabel={label}
            accessibilityState={{ selected: status === "current" }}
          >
            {i > 0 ? (
              <View className={cn(s.line, s.lineOffset, status === "upcoming" ? s.lineUpcoming : s.lineDone)} />
            ) : null}
            <View className={cn(s.dot, DOT_BOX[status])}>
              {icon ? (
                <Icon name={icon.name} size={14} color={icon.color} />
              ) : (
                <Text className={cn(s.dotText, DOT_TEXT[status])}>{i + 1}</Text>
              )}
            </View>
            <Text className={cn(s.label, "text-center", status === "upcoming" ? s.labelUpcoming : s.labelDone)}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
