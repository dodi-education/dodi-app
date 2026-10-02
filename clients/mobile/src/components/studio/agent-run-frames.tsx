import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { STAGE } from "@dodi/games/stage";
import type { AgentRunFrame } from "@dodi/studio/agent-run-log";
import { agentRunFrames as styles } from "@dodi/ui-recipes";

import { Dialog, Text } from "@/components/ui";

const FRAME_ASPECT = STAGE.aspectW / STAGE.aspectH;

/**
 * The frames one screenshot check captured, as labelled thumbnails. A press
 * opens the frame large (the full capture while it is still in this session,
 * the kept thumbnail after a reload).
 */
export function AgentRunFrames({ frames }: { frames: AgentRunFrame[] }) {
  const t = useTranslations("gameStudio");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex === null ? null : frames[openIndex];

  return (
    <>
      <View className={styles.list}>
        {frames.map((frame, i) => (
          <View key={i} className={styles.item}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("runLogOpenFrame", { label: frame.label })}
              onPress={() => setOpenIndex(i)}
              className={styles.button}
            >
              <Image
                source={{ uri: frame.image }}
                className={styles.image}
                style={{ aspectRatio: FRAME_ASPECT }}
                resizeMode="cover"
              />
            </Pressable>
            <Text numberOfLines={2} className={styles.label}>
              {frame.label}
            </Text>
          </View>
        ))}
      </View>
      <Dialog
        isOpen={open !== null}
        onClose={() => setOpenIndex(null)}
        title={t("runLogFrameTitle")}
        description={open?.label}
      >
        {open ? (
          <Image
            accessibilityLabel={open.label}
            source={{ uri: open.fullImage ?? open.image }}
            className={styles.large}
            style={{ width: "100%", aspectRatio: FRAME_ASPECT }}
            resizeMode="contain"
          />
        ) : null}
      </Dialog>
    </>
  );
}
