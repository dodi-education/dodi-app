import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable } from "react-native";
import { useTranslations } from "use-intl";
import { enterKidView } from "@dodi/client-state/kid-view";
import { kidViewButton as styles } from "@dodi/ui-recipes";

import { mobilePlatform } from "@/adapters/platform";
import { Icon, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { MAX_FONT_SCALE } from "@/lib/font-scale";

/**
 * The top bar's "Kid View" button, as on the web: picks the last-used kid
 * (else the first), re-locks the parent area on this device and opens the
 * kid view. The kid view speaks the kid's language (KidLocaleProvider).
 */
export function KidViewButton() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  async function switchToKid(): Promise<void> {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await enterKidView({
        kids: clientState.kids,
        persistence: mobilePlatform.activeKid,
        // The kid layout re-locks the parent area as it mounts
        // (onKidViewMount); locking here, while this page is still shown,
        // would flash the parent PIN prompt before the navigation.
        parentLock: { markUnlocked: () => {}, clear: () => {} },
      });
      // Replace, so Back doesn't return to the (now locked) parent page.
      router.replace("/home");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("kidView")}
      accessibilityState={{ busy: isBusy }}
      onPress={() => void switchToKid()}
      hitSlop={8}
      className={cn(styles.box, "active:border-primary")}
    >
      <Icon name="games" size={styles.icon.size} />
      <Text className={styles.text} maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
        {t("kidView")}
      </Text>
    </Pressable>
  );
}
