import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import type { StudioChatMessage } from "@dodi/studio/transcript";
import { chatMessage as styles } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { AgentRunHistory } from "./agent-run-history";
import { RichText } from "./rich-text";
import { DODI_HEAD } from "./dodi-images";

interface TurnLinksProps {
  onShowChanges: () => void;
  onRevert: () => void;
  isReverted: boolean;
  isRevertDisabled: boolean;
}

/** "Show changes | Revert" under the last code-changing reply. */
function TurnLinks({ onShowChanges, onRevert, isReverted, isRevertDisabled }: TurnLinksProps) {
  const t = useTranslations("gameStudio");
  return (
    <View className={styles.links}>
      <Pressable
        accessibilityRole="button"
        onPress={onShowChanges}
        hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
      >
        <Text className={styles.linksText}>{t("showChanges")}</Text>
      </Pressable>
      <Text className={styles.linksText} accessibilityElementsHidden importantForAccessibility="no">
        |
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isRevertDisabled }}
        onPress={onRevert}
        disabled={isRevertDisabled}
        hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
        className={cn(isRevertDisabled && styles.linkDisabled)}
      >
        <Text className={styles.linksText}>{isReverted ? t("restoreVersion") : t("revertVersion")}</Text>
      </Pressable>
    </View>
  );
}

interface ChatMessageItemProps {
  message: StudioChatMessage;
  /** The turn links, on the last code-changing reply only. */
  links?: TurnLinksProps;
}

/** One turn of the thread: dodi's reply (with its run log), or the parent's bubble. */
export function ChatMessageItem({ message, links }: ChatMessageItemProps) {
  const t = useTranslations("gameStudio");
  if (message.role === "assistant") {
    return (
      <View className={styles.row}>
        <Image
          source={DODI_HEAD}
          className={styles.avatar}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View className={styles.body}>
          <RichText text={message.text} textClassName={styles.bodyText} />
          {message.run ? <AgentRunHistory run={message.run} /> : null}
          {links ? <TurnLinks {...links} /> : null}
        </View>
      </View>
    );
  }
  return (
    <View className={styles.userRow}>
      <View className={styles.bubble}>
        {message.images && message.images.length > 0 ? (
          <View className={styles.images}>
            {message.images.map((img, j) => (
              <Image
                key={j}
                source={{ uri: img }}
                className={styles.image}
                resizeMode="cover"
                accessible
                accessibilityRole="image"
                accessibilityLabel={t("attachedImage", { n: j + 1 })}
              />
            ))}
          </View>
        ) : null}
        <RichText text={message.text} textClassName={styles.bubbleText} />
      </View>
    </View>
  );
}
