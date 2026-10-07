import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { chatHeader as styles } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { useAnnounceOnIos } from "@/lib/announce";
import { cn } from "@/lib/cn";

import { DODI_HEAD } from "./dodi-images";
import { PulseDot } from "./thinking-dots";

interface ChatHeaderProps {
  /** What dodi is doing (role, plan thinking, or the build step). */
  statusText: string;
  isThinking: boolean;
  canClear: boolean;
  onClear: () => void;
}

/** The chat pane's header: dodi, its status line, and Clear history. */
export function ChatHeader({ statusText, isThinking, canClear, onClear }: ChatHeaderProps) {
  const t = useTranslations("gameStudio");
  // TalkBack reads the status line's live region; VoiceOver hears it here.
  useAnnounceOnIos(statusText);
  return (
    <View className={styles.box}>
      <View className={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={DODI_HEAD} className={styles.avatarImage} resizeMode="contain" />
      </View>
      <View className={styles.info}>
        <Text className={styles.name}>{t("designerName")}</Text>
        <View className={styles.status} accessibilityLiveRegion="polite">
          {isThinking ? (
            <PulseDot className={cn(styles.dot, styles.dotBusy)} />
          ) : (
            <View className={cn(styles.dot, styles.dotIdle)} />
          )}
          <Text numberOfLines={1} className={cn(styles.statusText, "shrink")}>
            {statusText}
          </Text>
        </View>
      </View>
      {/* Clear the conversation history (also available by typing /clear). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("clearHistory")}
        accessibilityState={{ disabled: !canClear }}
        onPress={onClear}
        disabled={!canClear}
        hitSlop={6}
        className={cn(styles.clear, !canClear && styles.clearDisabled, "active:bg-danger-soft")}
      >
        <Icon name="delete" size={styles.clearIcon.size} color="muted-foreground" />
      </Pressable>
    </View>
  );
}
