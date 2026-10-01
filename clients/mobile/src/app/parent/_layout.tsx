import { Redirect, Tabs } from "expo-router";
import { IconLayoutDashboard, IconSettings } from "@/components/ui/icons";
import { useTranslations } from "use-intl";

import { ParentPinGate } from "@/components/parent/parent-pin-gate";
import { VaultGate } from "@/components/vault/vault-gate";
import { useSession } from "@/lib/session";

/** The parent area: signed in, vault open, parent PIN (if set) solved. */
export default function ParentLayout() {
  const t = useTranslations("nav");
  const isSignedIn = useSession((s) => s.isSignedIn);
  if (!isSignedIn) return <Redirect href="/login" />;

  return (
    <VaultGate>
      <ParentPinGate>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#2F6BD8",
            tabBarInactiveTintColor: "#61758C",
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: t("dashboard"),
              tabBarIcon: ({ color, size }) => <IconLayoutDashboard color={color} size={size} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: t("settings"),
              tabBarIcon: ({ color, size }) => <IconSettings color={color} size={size} />,
            }}
          />
        </Tabs>
      </ParentPinGate>
    </VaultGate>
  );
}
