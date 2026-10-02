import { type Href, Link, Slot, usePathname } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";
import { isNavItemActive, SETTINGS_NAV } from "@dodi/client-state/parent-nav";
import { settingsTab } from "@dodi/ui-recipes";

import { BackLink } from "@/components/parent/back-link";
import { ShellContent } from "@/components/shared/shell-content";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Settings (web: parent/settings/layout + settings-sidebar, compact branch):
 * a back link to the dashboard and the horizontally scrolling tab strip above
 * the section content. No native headers.
 */
export default function SettingsLayout() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <ShellContent>
      <View className="mb-5">
        <BackLink href="/parent/dashboard">{t("settings.back")}</BackLink>
        {/* settingsTab.strip: the negative margin on the scroller, the rest on its content. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-4"
          contentContainerClassName={cn(settingsTab.strip.replace("-mx-4", ""))}
          accessibilityRole="tablist"
        >
          {SETTINGS_NAV.map((item) => {
            const isActive = isNavItemActive(item, pathname);
            return (
              <Link key={item.href} href={item.href as Href} asChild>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  className={cn(
                    settingsTab.box,
                    isActive ? settingsTab.boxActive : "active:bg-foreground/5",
                  )}
                >
                  <Text
                    numberOfLines={1}
                    className={cn(settingsTab.text, isActive ? settingsTab.textActive : settingsTab.textInactive)}
                  >
                    {t(item.labelKey)}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </ScrollView>
      </View>
      <Slot />
    </ShellContent>
  );
}
