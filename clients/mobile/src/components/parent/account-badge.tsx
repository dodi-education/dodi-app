import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { accountBadge as styles } from "@dodi/ui-recipes";

import { mobileAuthApi } from "@/adapters/auth";
import { Icon, Text } from "@/components/ui";
import { useAccountStore } from "@/lib/client-state";
import { signOut } from "@/lib/session";

/** The drawer footer, as on the web: initial, email, plan, sign out. */
export function AccountBadge() {
  const t = useTranslations();
  const router = useRouter();
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void mobileAuthApi.sessionUser().then((user) => {
      if (isCurrent) setEmail(user?.email ?? null);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  if (!email) return null;
  return (
    <View className={styles.row}>
      <View className={styles.avatar}>
        <Text className={styles.avatarText}>{email.charAt(0).toUpperCase()}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className={styles.email} numberOfLines={1}>
          {email}
        </Text>
        <Text className={styles.tier}>
          {t("settings.tierLabel", { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.signOut")}
        hitSlop={11}
        className={styles.signOut}
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      >
        <Icon name="logout" size={styles.signOutIcon.size} color="faint" />
      </Pressable>
    </View>
  );
}
