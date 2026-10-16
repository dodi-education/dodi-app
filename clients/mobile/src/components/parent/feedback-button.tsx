import { Pressable } from "react-native";
import { useTranslations } from "use-intl";
import { navItem } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * "Give feedback" at the foot of the drawer, above the account badge. Styled
 * like a nav item; it opens the feedback dialog rather than navigating. Web:
 * components/parent/feedback-button.
 */
export function FeedbackButton({ onPress }: { onPress: () => void }) {
  const t = useTranslations("feedback");
  return (
    <Pressable
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      onPress={onPress}
      className={cn(navItem.box, "active:bg-foreground/5")}
    >
      <Icon name="feedback" size={navItem.icon.size} color="ink-2" />
      <Text className={cn(navItem.text, navItem.textInactive)}>{t("button")}</Text>
    </Pressable>
  );
}
