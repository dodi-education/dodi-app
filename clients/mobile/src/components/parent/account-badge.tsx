import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { mobileAuthApi } from "@/adapters/auth";
import { Text } from "@/components/ui";
import { IconLogout } from "@/components/ui/icons";
import { useAccountStore } from "@/lib/client-state";
import { signOut } from "@/lib/session";

/**
 * The signed-in account (web: parent/account-badge): email, plan tier and
 * sign-out. The email comes from the auth session, the tier from the shared
 * account store.
 */
export function AccountBadge() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const tier = useAccountStore((s) => s.account?.subscribed_plan ?? "egg");
  const loadAccount = useAccountStore((s) => s.load);

  useEffect(() => {
    void loadAccount();
    let isCurrent = true;
    void mobileAuthApi
      .sessionUser()
      .then((user) => {
        if (isCurrent) setEmail(user?.email ?? "");
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [loadAccount]);

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace("/login");
  }

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
      <View className="h-8 w-8 items-center justify-center rounded-full bg-primary-soft-2">
        <Text className="text-xs font-bold text-primary">{(email[0] ?? "?").toUpperCase()}</Text>
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold">
          {email}
        </Text>
        <Text variant="muted" className="text-xs">
          {t("tierLabel", { tier: tier.charAt(0).toUpperCase() + tier.slice(1) })}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tc("signOut")}
        onPress={() => void handleSignOut()}
        className="h-11 w-11 items-center justify-center"
      >
        <IconLogout size={20} color="#61758C" />
      </Pressable>
    </View>
  );
}
