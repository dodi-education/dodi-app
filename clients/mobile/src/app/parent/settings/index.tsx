import { type Href, useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { Button, Screen } from "@/components/ui";
import { IconBell, IconLock, IconQrcode, IconSettings, IconSparkles } from "@/components/ui/icons";
import { ListRow } from "@/components/ui/list-row";
import { signOut } from "@/lib/session";

const ICON = { size: 18, color: "#2F6BD8" };

/**
 * The settings menu (web: the settings sidebar). Game Studio settings follow
 * with the Game Studio port.
 */
export default function SettingsIndexScreen() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const sections: { href: Href; label: string; icon: ReactNode }[] = [
    { href: "/parent/settings/general", label: t("navGeneral"), icon: <IconSettings {...ICON} /> },
    { href: "/parent/settings/notifications", label: t("navNotifications"), icon: <IconBell {...ICON} /> },
    { href: "/parent/settings/security", label: t("navSecurity"), icon: <IconLock {...ICON} /> },
    { href: "/parent/settings/ai-providers", label: t("navAiProviders"), icon: <IconSparkles {...ICON} /> },
    { href: "/parent/settings/devices", label: t("navDevices"), icon: <IconQrcode {...ICON} /> },
  ];

  async function handleSignOut(): Promise<void> {
    setIsSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <Screen>
      <View className="overflow-hidden rounded-2xl border border-border bg-card">
        {sections.map((section, index) => (
          <ListRow
            key={section.label}
            label={section.label}
            icon={section.icon}
            isFirst={index === 0}
            onPress={() => router.push(section.href)}
          />
        ))}
      </View>
      <Button
        variant="secondary"
        label={tc("signOut")}
        isLoading={isSigningOut}
        onPress={() => void handleSignOut()}
      />
    </Screen>
  );
}
