import { type Href, Link, usePathname } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Animated, BackHandler, Image, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { isNavItemActive, PARENT_NAV_GROUPS } from "@dodi/client-state/parent-nav";
import { drawer, navGroupLabel, navItem, topBar } from "@dodi/ui-recipes";

import { writeLastView } from "@/adapters/platform";
import { AccountBadge } from "@/components/parent/account-badge";
import { KidViewButton } from "@/components/parent/kid-view-button";
import { Icon, type IconName, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { RefreshScope, useNewRefreshRegistry } from "@/lib/refresh-scope";
import { isReduceMotionOn } from "@/lib/use-reduce-motion";

import { Breadcrumbs } from "./breadcrumbs";
import { PageBackground } from "./page-background";
import { Wordmark } from "./wordmark";

/**
 * The parent area's frame, as the web renders it on a phone: a sticky white
 * top bar (menu button, breadcrumbs as the page title, Kid View) and the menu
 * in a left drawer. No tab bar, no native headers.
 */
export function ParentShell({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Pull to refresh: the page's ShellContent and its parts register here.
  const refreshRegistry = useNewRefreshRegistry();

  // The next launch opens the parent area (past the PIN gate, which renders
  // this shell only once solved).
  useEffect(() => writeLastView("parent"), []);

  // While the drawer is open, TalkBack stays inside it (iOS: its accessibilityViewIsModal).
  const behindDrawer = isMenuOpen ? "no-hide-descendants" : "auto";

  return (
    <PageBackground>
      <View
        className={topBar.root}
        style={{ paddingTop: 12 + insets.top }}
        importantForAccessibility={behindDrawer}
      >
        <View className={topBar.row}>
          <View className={topBar.left}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("openMenu")}
              onPress={() => setIsMenuOpen(true)}
              // 36pt button: a 44pt target.
              hitSlop={4}
              className={cn(topBar.menuButton, "active:bg-foreground/5")}
            >
              <Icon name="menu" size={topBar.menuIcon.size} stroke={topBar.menuIcon.stroke} color="ink-2" />
            </Pressable>
            <Breadcrumbs />
          </View>
          <KidViewButton />
        </View>
      </View>
      <View className="flex-1" importantForAccessibility={behindDrawer}>
        <RefreshScope registry={refreshRegistry}>{children}</RefreshScope>
      </View>
      <Drawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </PageBackground>
  );
}

function Drawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(drawer.width, screenWidth * drawer.maxWidthRatio);
  const [progress] = useState(() => new Animated.Value(0));
  // True once fully open, until fully closed: keeps the panel rendered while
  // the close animation runs.
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    // Reduced motion: the drawer appears in place (read at the toggle, not a dependency).
    const duration = isReduceMotionOn() ? 0 : 300;
    Animated.timing(progress, { toValue: isOpen ? 1 : 0, duration, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setIsShown(isOpen);
      },
    );
  }, [isOpen, progress]);

  // Android back closes the drawer first, like the web's popstate handling.
  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, onClose]);

  // Navigating closes it.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!isOpen && !isShown) return null;
  return (
    <View className="absolute inset-0" style={{ zIndex: 60 }} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      {/* A tap outside closes it; screen readers use the close button (or escape / back). */}
      <Animated.View
        className={cn("absolute inset-0", drawer.backdrop)}
        style={{ opacity: progress }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Pressable accessible={false} className="flex-1" onPress={onClose} />
      </Animated.View>
      <Animated.View
        className={cn("absolute bottom-0 left-0 top-0", drawer.panel)}
        style={{
          width,
          paddingTop: 20 + insets.top,
          paddingBottom: 16 + insets.bottom,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }],
          shadowColor: "#22384E",
          shadowOpacity: 0.22,
          shadowRadius: 25,
          shadowOffset: { width: 0, height: 18 },
          elevation: 16,
        }}
      >
        <View className={drawer.header}>
          <Link href="/parent/dashboard" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={t("nav.dashboard")} className={drawer.brand}>
              <Image
                accessibilityElementsHidden
                importantForAccessibility="no"
                source={require("../../../assets/images/splash.png")}
                style={{ width: 30, height: 30, transform: [{ translateY: -5 }] }}
              />
              <Wordmark />
            </Pressable>
          </Link>
          <View className={drawer.headerActions}>
            <Link href="/parent/settings/general" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t("nav.settings")}
                hitSlop={4}
                className={cn(drawer.headerButton, "active:bg-foreground/5")}
              >
                <Icon name="settings" size={drawer.headerIcon.size} stroke={drawer.headerIcon.stroke} color="muted-foreground" />
              </Pressable>
            </Link>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("nav.closeMenu")}
              onPress={onClose}
              hitSlop={4}
              className={cn(drawer.headerButton, "active:bg-foreground/5")}
            >
              <Icon name="close" size={drawer.headerIcon.size} stroke={drawer.headerIcon.stroke} color="muted-foreground" />
            </Pressable>
          </View>
        </View>
        <ScrollView className="flex-1" contentContainerClassName="gap-0.5">
          {PARENT_NAV_GROUPS.map((group, gi) => (
            <View key={group.labelKey} className="gap-0.5">
              <Text className={cn(navGroupLabel.text, gi === 0 ? navGroupLabel.first : navGroupLabel.rest)}>
                {t(group.labelKey)}
              </Text>
              {group.items.map((item) => {
                const isActive = isNavItemActive(item, pathname);
                return (
                  <Link key={item.href} href={item.href as Href} asChild>
                    <Pressable
                      hitSlop={{ top: 4, bottom: 4 }}
                      accessibilityRole="link"
                      accessibilityState={{ selected: isActive }}
                      className={cn(navItem.box, isActive ? navItem.boxActive : "active:bg-foreground/5")}
                    >
                      <Icon
                        name={item.icon as IconName}
                        size={navItem.icon.size}
                        color={isActive ? "primary" : "ink-2"}
                      />
                      <Text className={cn(navItem.text, isActive ? navItem.textActive : navItem.textInactive)}>
                        {t(item.labelKey)}
                      </Text>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <View className={drawer.footer}>
          <AccountBadge />
        </View>
      </Animated.View>
    </View>
  );
}
