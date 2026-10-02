import { type Href, usePathname, useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { type ReactNode, useEffect } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { onBackOnline } from "@dodi/client-state/connectivity-store";
import { onKidViewMount } from "@dodi/client-state/kid-view";
import type { Kid } from "@dodi/types/database";
import { kidChrome, kidGateHint, kidLoadingStage, kidNav } from "@dodi/ui-recipes";

import { mobilePlatform } from "@/adapters/platform";
import { DodiCompact } from "@/components/dodi/dodi-compact";
import { CompanionVolumeControl } from "@/components/kid/companion-volume-control";
import { PageBackground } from "@/components/shared/page-background";
import { SnapshotFlashHost } from "@/components/snapshots/snapshot-flash-host";
import { Icon, type IconName } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { notifyCompanionInteraction } from "@/lib/companion-session";
import { useDodiSessionStore } from "@/lib/dodi-session-store";
import { registerKidNavItem, remeasureKidNavItem } from "@/lib/kid-nav-rects";
import { emitKidTabReselect } from "@/lib/kid-tab-reselect";
import { endVoiceSession } from "@/lib/kid-voice";
import { flushPlayOutbox } from "@/lib/play-sync";
import { flushPendingAutosaves } from "@/lib/snapshots";
import { useActiveKid } from "@/lib/use-active-kid";

import { KidAvatar } from "./kid-avatar";
import { kidShadowStyle } from "./kid-shadow";
import { KidSwitcher } from "./kid-switcher";
import { KidText } from "./kid-text";

const KEEP_AWAKE_TAG = "dodi-voice";

const KID_NAV_ITEMS: { href: "/home" | "/games" | "/snapshots" | "/friends"; key: string; icon: IconName }[] = [
  { href: "/home", key: "home", icon: "home" },
  { href: "/games", key: "games", icon: "games" },
  { href: "/snapshots", key: "snapshots", icon: "camera" },
  { href: "/friends", key: "friends", icon: "friends" },
];

/**
 * The kid view's frame, as the web renders it on a phone (web:
 * components/kid/kid-chrome): a non-sticky header (kid switcher, compact dodi,
 * volume, "Parent"), PIN gating, and the bottom navigation. The page scrolls
 * between them; screens render plain content (`children`, the (kid) routes'
 * Slot). It also hosts the voice session's app-wide parts: dodi's navigation
 * (launch_game), the keep-awake while a conversation is on, and the session's
 * end when the kid view goes away.
 *
 * Not here: the web's "any click lifts the audio-gesture deaf" listener (native
 * audio needs no gesture) and the offline data warmup (roadmap phase 6).
 */
export function KidChrome({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // `needsPin`: the active profile is PIN-locked and not yet unlocked this
  // session; the switcher opens its puzzle and the page is withheld.
  const { kids, activeKid, needsPin } = useActiveKid();

  // Being in the kid view locks the parent area (the PIN is asked again on the
  // way back), and the vault re-opens silently with the device key.
  useEffect(() => {
    onKidViewMount({ parentLock: mobilePlatform.parentLock, vault: clientState.vault });
  }, []);

  // Leaving the kid view ends the voice session.
  useEffect(() => () => endVoiceSession(), []);

  const displayMode = useDodiSessionStore((s) => s.displayMode);
  const context = useDodiSessionStore((s) => s.context);
  const dodiState = useDodiSessionStore((s) => s.state);
  const pendingNavigation = useDodiSessionStore((s) => s.pendingNavigation);
  const clearPendingNavigation = useDodiSessionStore((s) => s.clearPendingNavigation);

  // dodi opened a game or a filtered library (launch_game).
  useEffect(() => {
    if (!pendingNavigation) return;
    router.push(pendingNavigation as Href);
    clearPendingNavigation();
  }, [pendingNavigation, router, clearPendingNavigation]);

  // A conversation keeps the screen on (web: no lock while the tab is open).
  const isConversationOn = dodiState === "active" || dodiState === "deaf";
  useEffect(() => {
    if (!isConversationOn) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isConversationOn]);

  // Flush work parked while offline (snapshot autosaves, the play outbox): on
  // entry and on every offline→online transition.
  useEffect(() => {
    const flush = () => {
      void flushPendingAutosaves();
      void flushPlayOutbox();
    };
    flush();
    return onBackOnline(clientState.connectivity, flush);
  }, []);

  function onNavPress(href: (typeof KID_NAV_ITEMS)[number]["href"]): void {
    // Re-tapping the tab you're on resets that section (web: kid-tab-reselect).
    if (pathname === href) {
      emitKidTabReselect(href);
      return;
    }
    router.navigate(href as Href);
  }

  function switchToParent(): void {
    endVoiceSession();
    // The parent layout's PIN gate asks for the parent PIN (when one is set).
    router.replace("/parent/dashboard");
  }

  // Game views (/games/[id] play, /snapshots/[id] replay) own their layout and
  // scrolling, as the web's full-mode game views do, so a drag or drawing game
  // never fights a page scroll; every other page scrolls in the chrome.
  const isFullMode = /^\/(games|snapshots)\/[^/]+/.test(pathname);
  // The compact dodi: on browse pages, and in a game (whose desktop side panel
  // a phone doesn't show); the home stage has the full dodi instead.
  const isCompactShown = displayMode === "compact" || (context.type === "game" && displayMode === "full");

  const header = (
    <View className={kidChrome.header}>
      <View className={kidChrome.headerLeft}>
        <View className="shrink-0">
          <KidSwitcher />
        </View>
        {isCompactShown ? <DodiCompact /> : null}
        {/* Volume/mute is a global companion property: on every kid view. */}
        <CompanionVolumeControl />
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t("switchToParentView")}
        onPress={switchToParent}
        hitSlop={6}
        className={cn(kidChrome.parentLink, "active:opacity-70")}
      >
        <Icon name="lock" size={kidChrome.parentIcon.size} color="faint" />
        <KidText className={kidChrome.parentLinkText}>{t("parent")}</KidText>
      </Pressable>
    </View>
  );

  // Kids must be loaded and the active profile unlocked before the page
  // mounts, so nothing runs for a locked profile.
  const page = kids === null ? <KidLoadingStage /> : needsPin ? <KidGateHint kid={activeKid} /> : null;

  return (
    // Every touch keeps dodi awake (web: document click/touch/key listeners).
    <PageBackground onTouchStart={() => notifyCompanionInteraction()}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {isFullMode && !page ? (
          <View className="flex-1" style={{ paddingTop: insets.top }}>
            {header}
            <View className={kidChrome.mainFull} style={{ paddingBottom: 96 + insets.bottom }}>
              <View className={cn(kidChrome.mainFullInner, "flex-1")}>{children}</View>
            </View>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="grow"
            contentContainerStyle={{ paddingTop: insets.top }}
          >
            {header}
            <View className={kidChrome.main} style={{ paddingBottom: 96 + insets.bottom }}>
              {page ?? children}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Bottom navigation */}
      <View
        className={kidNav.box}
        style={[{ paddingBottom: kidNav.paddingBottom + insets.bottom }, kidShadowStyle("row")]}
        accessibilityRole="tablist"
        // The whole nav moving (rotation, insets) re-measures every item.
        onLayout={() => KID_NAV_ITEMS.forEach((item) => remeasureKidNavItem(item.href))}
      >
        {KID_NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Pressable
              key={item.href}
              // Where each item sits (web: data-kid-nav), for the snapshot flash's landing spot.
              ref={(view) => registerKidNavItem(item.href, view)}
              onLayout={() => remeasureKidNavItem(item.href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => onNavPress(item.href)}
              className={cn(kidNav.item, isActive && kidNav.activeItem)}
            >
              <Icon
                name={item.icon}
                size={kidNav.icon.size}
                stroke={kidNav.icon.stroke}
                color={isActive ? "primary" : "faint"}
              />
              <KidText className={cn(kidNav.itemText, isActive ? kidNav.activeText : kidNav.inactiveText)}>
                {t(item.key as "home")}
              </KidText>
            </Pressable>
          );
        })}
      </View>

      {/* The snapshot flash's full-window layer, above the page and the nav. */}
      <SnapshotFlashHost />
    </PageBackground>
  );
}

/** Placeholder while the E2EE kid list loads (before we know the active kid). */
function KidLoadingStage() {
  return (
    <View className={kidLoadingStage.root} accessibilityState={{ busy: true }}>
      <View className={kidLoadingStage.circle} />
      <View className={kidLoadingStage.bar} />
    </View>
  );
}

/** Shown behind the auto-opened switcher puzzle while a locked profile is gated. */
function KidGateHint({ kid }: { kid: Kid | null }) {
  const t = useTranslations("kidProfile");
  if (!kid) return null;
  return (
    <View className={kidGateHint.root}>
      <View className={kidGateHint.avatarWrap}>
        <KidAvatar kid={kid} size={96} />
        <View className={kidGateHint.lockBadge} style={kidShadowStyle("sm")}>
          <Icon name="lock" size={20} color="faint" />
        </View>
      </View>
      <KidText className={cn(kidGateHint.text, kidGateHint.textAlign)}>{t("solveToStart")}</KidText>
    </View>
  );
}
