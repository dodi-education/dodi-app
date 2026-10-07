import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import {
  AVATAR_GROUPS,
  KID_AVA_COLORS,
  type AvatarConfig,
  avatarColorOf,
  readAvatarConfig,
} from "@dodi/client-state/avatars";
import { refreshFriendCards } from "@dodi/client-state/friends";
import {
  PIN_SOLVED_DELAY_MS,
  createCardRefreshScheduler,
  kidPickAction,
  parseAvatarPin,
  solvedPinAction,
  switchActiveKid,
  updateKidLook,
  verifyAvatarPin,
} from "@dodi/client-state/kid-view";
import type { Kid } from "@dodi/types/database";
import { kidSwitcher as s, kidSwitcherSizes as sizes } from "@dodi/ui-recipes";

import { api } from "@/adapters/platform";
import { Icon } from "@/components/ui";
import { avatarImage } from "@/lib/avatar-images";
import { clientState, useActiveKidStore, useKidStore, useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { endVoiceSession } from "@/lib/kid-voice";
import { useActiveKid } from "@/lib/use-active-kid";
import { useReduceMotion } from "@/lib/use-reduce-motion";

import { AvatarPinPuzzle } from "./avatar-pin-puzzle";
import { KidAvatar } from "./kid-avatar";
import { kidShadowStyle } from "./kid-shadow";
import { KidText } from "./kid-text";

/** Six tiles per row with gap-2 (8px), like the web's grid-cols-6. */
const GRID_COLUMNS = 6;
const GRID_GAP = 8;

/**
 * The header's "Who's playing?" switcher (web: components/kid/kid-switcher):
 * the active kid's pill opens a popover listing the kids (PIN-locked ones
 * solve their avatar puzzle first) and the active kid's look editor. While the
 * active profile is gated the popover is forced open and can't be dismissed.
 * On a phone the popover is a modal overlay under the pill.
 */
export function KidSwitcher() {
  const t = useTranslations("kidProfile");
  const tn = useTranslations("nav");
  const isReduced = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const { kids: kidList, activeKid, activeKidId, needsPin } = useActiveKid();
  const kids = kidList ?? [];
  const unlockedKidIds = useActiveKidStore((st) => st.unlockedKidIds);
  const markUnlocked = useActiveKidStore((st) => st.markUnlocked);

  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  const pillRef = useRef<View>(null);
  const solveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seal this kid's friend cards after they edit their look, so friends see
  // the new avatar/color. Debounced while tapping; flushed when the popover
  // closes or unmounts so a friend never keeps a stale card.
  const [cardRefresh] = useState(() =>
    createCardRefreshScheduler((kidId) => {
      const session = useVaultStore.getState().session;
      const kid = useKidStore.getState().byId[kidId];
      if (session && kid) void refreshFriendCards(api, kid, session).catch(() => {});
    }),
  );

  useEffect(
    () => () => {
      cardRefresh.flush();
      if (solveTimer.current) clearTimeout(solveTimer.current);
    },
    [cardRefresh],
  );

  const forceClose = useCallback(() => {
    setIsOpen(false);
    setPending(null);
    cardRefresh.flush();
  }, [cardRefresh]);

  const closePopover = useCallback(() => {
    // While a locked profile is gated the popover can't be dismissed: the kid
    // must solve the puzzle (or switch to another profile) to continue.
    if (needsPin) return;
    forceClose();
  }, [needsPin, forceClose]);

  // A gated profile forces the popover open (and keeps it open).
  const isPopoverOpen = isOpen || needsPin;

  // Place the popover under the pill (web: absolute top-full mt-2.5).
  useEffect(() => {
    if (!isPopoverOpen) return;
    pillRef.current?.measureInWindow((_x, y, _w, h) => setAnchorBottom(y + h));
  }, [isPopoverOpen]);

  // When gated, always show a puzzle (never the look editor for a locked profile).
  const shownPendingId = pending ?? (needsPin ? activeKidId : null);
  const shownPendingKid = shownPendingId ? (kids.find((p) => p.id === shownPendingId) ?? null) : null;
  // Back out of a puzzle only when it's an optional switch, not the entry gate.
  const canCancelPuzzle = !!pending && pending !== activeKidId;

  function handleSwitch(kid: Kid): void {
    switchActiveKid({ activeKid: clientState.activeKid, endVoiceSession }, kid);
    forceClose();
  }

  function onPickKid(kid: Kid): void {
    const action = kidPickAction(kid, { activeKidId, needsPin, unlockedKidIds });
    if (action === "puzzle") setPending(kid.id);
    else if (action === "switch") handleSwitch(kid);
  }

  /** Persist a look change for the active kid: optimistic + sealed PATCH. */
  function updateLook(partial: Partial<AvatarConfig>): void {
    if (!activeKid) return;
    const isSent = updateKidLook({ api, kids: clientState.kids, vault: clientState.vault }, activeKid, partial);
    // Propagate the new look to friends' cards (debounced across rapid taps).
    if (isSent) cardRefresh.schedule(activeKid.id);
  }

  if (kids.length === 0) {
    return <View className={s.empty} />;
  }

  const activeCfg: AvatarConfig = activeKid ? readAvatarConfig(activeKid.avatar_config) : { color: 0, avatar: null };
  const ringColor = avatarColorOf(activeCfg);
  const popoverWidth = Math.min(400, screenWidth - 32);

  return (
    <View>
      <Pressable
        ref={pillRef}
        accessibilityRole="button"
        accessibilityLabel={tn("switchKid")}
        accessibilityState={{ expanded: isPopoverOpen }}
        onPress={() => (isPopoverOpen ? closePopover() : setIsOpen(true))}
        // The pill is 46pt tall; widen the target a little for small hands.
        hitSlop={4}
        className={cn(s.pill, "active:bg-white")}
      >
        {activeKid ? (
          <KidAvatar kid={activeKid} size={sizes.pillAvatar} />
        ) : (
          <View className={s.pillAvatarEmpty} />
        )}
        {activeKid ? (
          <KidText className={cn(s.pillText, s.pillName)} numberOfLines={1}>
            {activeKid.display_name}
          </KidText>
        ) : null}
        <View style={{ transform: [{ rotate: isPopoverOpen ? "180deg" : "0deg" }] }}>
          <Icon name="chevron_down" size={s.chevron.size} color="faint" />
        </View>
      </Pressable>

      <Modal
        visible={isPopoverOpen && anchorBottom !== null}
        transparent
        animationType={isReduced ? "none" : "fade"}
        onRequestClose={closePopover}
        statusBarTranslucent
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          className="absolute inset-0"
          onPress={closePopover}
          disabled={needsPin}
        />
        <View
          accessibilityViewIsModal
          // No escape while a locked profile is gated (as the close button).
          onAccessibilityEscape={needsPin ? undefined : closePopover}
          accessibilityLabel={t("whosPlaying")}
          className={s.popover}
          style={[
            {
              position: "absolute",
              left: 16,
              top: Math.max(anchorBottom ?? 0, insets.top),
              width: popoverWidth,
            },
            kidShadowStyle("popover"),
          ]}
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: screenHeight - Math.max(anchorBottom ?? 0, insets.top) - insets.bottom - 56 }}
          >
          <View className={s.head}>
            <KidText className={s.label}>{t("whosPlaying")}</KidText>
            {/* No close affordance while a locked profile is gated. */}
            {!needsPin ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("close")}
                onPress={closePopover}
                hitSlop={8}
                className={cn(s.close, "active:bg-border")}
              >
                <Icon name="close" size={sizes.closeIcon} stroke={2.3} color="muted-foreground" />
              </Pressable>
            ) : null}
          </View>

          <View className={s.list}>
            {kids.map((p) => {
              const isActive = p.id === activeKidId;
              const isPending = p.id === shownPendingId;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => onPickKid(p)}
                  className={cn(s.row, isActive && s.rowActive, isPending && s.rowPending, "active:bg-muted")}
                >
                  <KidAvatar kid={p} size={sizes.rowAvatar} />
                  <KidText className={s.rowName} numberOfLines={1}>
                    {p.display_name}
                  </KidText>
                  {isPending ? (
                    <Icon name="lock" size={sizes.rowLockIcon} color="faint" />
                  ) : isActive ? (
                    <Icon name="check" size={sizes.rowCheckIcon} stroke={2.6} color="primary" />
                  ) : parseAvatarPin(p) ? (
                    <View className="opacity-70">
                      <Icon name="lock" size={sizes.rowLockedIcon} color="faint" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View className={s.divider} />

          {shownPendingKid ? (
            <View>
              <View className={s.puzzleHead}>
                <KidText className={s.label}>{t("secret", { name: shownPendingKid.display_name })}</KidText>
                {canCancelPuzzle ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPending(null)}
                    hitSlop={10}
                    className={cn(s.cancel, "active:bg-muted")}
                  >
                    <KidText className={s.cancelText}>{t("cancel")}</KidText>
                  </Pressable>
                ) : null}
              </View>
              <KidText className={s.hint}>{t("secretHint")}</KidText>
              <AvatarPinPuzzle
                key={shownPendingKid.id}
                mode="solve"
                onSolve={(seq) => {
                  const isOk = verifyAvatarPin(shownPendingKid, seq);
                  if (isOk) {
                    solveTimer.current = setTimeout(() => {
                      if (solvedPinAction(shownPendingKid.id, activeKidId) === "unlock") {
                        // Entry unlock of the active profile: no switch.
                        markUnlocked(shownPendingKid.id);
                        forceClose();
                      } else {
                        handleSwitch(shownPendingKid);
                      }
                    }, PIN_SOLVED_DELAY_MS);
                  }
                  return isOk;
                }}
              />
            </View>
          ) : activeKid ? (
            <LookEditor
              kid={activeKid}
              cfg={activeCfg}
              ringColor={ringColor}
              onChange={updateLook}
              width={popoverWidth - 32}
            />
          ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/** The active kid's look: color dots + the avatar grid. */
function LookEditor({
  kid,
  cfg,
  ringColor,
  onChange,
  width,
}: {
  kid: Kid;
  cfg: AvatarConfig;
  ringColor: ReturnType<typeof avatarColorOf>;
  onChange: (partial: Partial<AvatarConfig>) => void;
  /** The popover's inner width (the grid's tiles are sized from it). */
  width: number;
}) {
  const t = useTranslations("kidProfile");
  // The grid runs -mx-1 px-1: its rows are as wide as the popover's content.
  const tile = (width - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS;

  return (
    <>
      <View className={s.lookHead}>
        <KidAvatar kid={kid} size={sizes.lookAvatar} pad={sizes.lookAvatarPad} />
        <View className="min-w-0 flex-1">
          <KidText className={s.label}>{t("look", { name: kid.display_name })}</KidText>
          <KidText className={s.lookHint}>{t("lookHint")}</KidText>
        </View>
      </View>

      <View className={s.colors}>
        {KID_AVA_COLORS.map((cc, i) => {
          const isSelected = cfg.color === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={t("colorLabel", { n: i + 1 })}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onChange({ color: i })}
              // 34pt dots: reach 44pt with the slop.
              hitSlop={5}
              className={s.color}
              style={{
                backgroundColor: cc.bg,
                borderWidth: sizes.ring,
                borderColor: isSelected ? cc.fg : "transparent",
              }}
            >
              <View
                className={s.colorDot}
                style={{
                  width: sizes.colorDot,
                  height: sizes.colorDot,
                  backgroundColor: cc.fg,
                  transform: [{ scale: isSelected ? 1.25 : 1 }],
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <ScrollView className={s.grid} style={{ maxHeight: 244 }} nestedScrollEnabled>
        {AVATAR_GROUPS.map((g, groupIndex) => (
          <View key={g.key}>
            <KidText className={cn(s.groupLabel, groupIndex === 0 && s.groupLabelFirst)}>
              {t(`group.${g.key}` as "group.animals")}
            </KidText>
            <View className={s.gridRow}>
              {g.items.map((id) => {
                const isSelected = cfg.avatar === id;
                const image = avatarImage(id);
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={id}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onChange({ avatar: id })}
                    className={s.tile}
                    style={{
                      width: tile,
                      backgroundColor: ringColor.ring,
                      borderWidth: sizes.ring,
                      borderColor: isSelected ? ringColor.fg : "transparent",
                    }}
                  >
                    {image ? <Image source={image} className={s.tileImage} resizeMode="contain" /> : null}
                    {isSelected ? (
                      <View className={s.tileCheck} style={[{ backgroundColor: ringColor.fg }, kidShadowStyle("sm")]}>
                        <Icon name="check" size={sizes.tileCheckIcon} stroke={3} color="primary-foreground" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}
