import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import type { StudioChatMessage } from "@dodi/studio/transcript";
import { chatMessage as styles } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";

import { AgentRunHistory } from "./agent-run-history";
import { RichText } from "./rich-text";
import { DODI_HEAD } from "./dodi-images";

interface TurnLinksProps {
  onShowChanges: () => void;
  onRevert: () => void;
  isReverted: boolean;
  isRevertDisabled: boolean;
}

/** "Show changes | Revert" under the last code-changing reply (inside its links row). */
function TurnLinks({ onShowChanges, onRevert, isReverted, isRevertDisabled }: TurnLinksProps) {
  const t = useTranslations("gameStudio");
  return (
    <>
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
    </>
  );
}

interface ChatMessageItemProps {
  message: StudioChatMessage;
  /** The parent's turns: dodi has read it (replied, or is working on it). */
  isRead: boolean;
  /** The turn links, on the last code-changing reply only. */
  links?: TurnLinksProps;
}

/** One turn of the thread: dodi's reply (with its run log), or the parent's bubble. */
export function ChatMessageItem({ message, isRead, links }: ChatMessageItemProps) {
  const t = useTranslations("gameStudio");
  const { formatMessageTime } = useAccountDateFormat();
  const stamp = message.at ? formatMessageTime(message.at) : "";
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
          {stamp || links ? (
            <View className={styles.links}>
              {stamp ? <Text className={cn(styles.linksText, styles.replyStamp)}>{stamp}</Text> : null}
              {stamp && links ? (
                <Text className={styles.linksText} accessibilityElementsHidden importantForAccessibility="no">
                  ·
                </Text>
              ) : null}
              {links ? <TurnLinks {...links} /> : null}
            </View>
          ) : null}
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
        <View
          className={styles.bubbleMeta}
          accessible
          accessibilityLabel={[stamp, t(isRead ? "readByDodi" : "sentToDodi")].filter(Boolean).join(", ")}
        >
          {stamp ? <Text className={styles.stamp}>{stamp}</Text> : null}
          <Icon name={isRead ? "checks" : "check"} size={14} stroke={2} color={isRead ? "primary" : "faint"} />
        </View>
      </View>
    </View>
  );
}
