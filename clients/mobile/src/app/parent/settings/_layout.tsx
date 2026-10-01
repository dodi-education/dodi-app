import { Stack } from "expo-router";
import { useTranslations } from "use-intl";

/**
 * Settings (web: parent/settings): a menu that pushes each section. Native
 * headers carry the titles and the back button.
 */
export default function SettingsLayout() {
  const t = useTranslations("settings");
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: "#2F6BD8",
        headerTitleStyle: { color: "#22384E" },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: t("title") }} />
      <Stack.Screen name="general" options={{ title: t("navGeneral") }} />
      <Stack.Screen name="notifications" options={{ title: t("navNotifications") }} />
      <Stack.Screen name="security" options={{ title: t("navSecurity") }} />
      <Stack.Screen name="ai-providers" options={{ title: t("navAiProviders") }} />
      <Stack.Screen name="devices" options={{ title: t("navDevices") }} />
    </Stack>
  );
}
