"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { AvatarPinPuzzle } from "@/components/kid/avatar-pin-puzzle";
import { KidAvatar } from "@/components/kid/kid-avatar";
import { Icon } from "@/components/shared/icon";
import { useActiveKid } from "@/hooks/use-active-kid";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { refreshFriendCards } from "@/lib/friends";
import {
  AVATAR_GROUPS,
  KID_AVA_COLORS,
  avatarImage,
  readAvatarConfig,
  type AvatarConfig,
} from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { kidSwitcher, kidSwitcherSizes } from "@dodi/ui-recipes";
import { useActiveKidStore } from "@/stores/active-kid-store";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  PIN_SOLVED_DELAY_MS,
  createCardRefreshScheduler,
  kidPickAction,
  parseAvatarPin as parsePin,
  solvedPinAction,
  switchActiveKid,
  updateKidLook,
  verifyAvatarPin,
} from "@dodi/client-state/kid-view";

import type { Kid } from "@dodi/types/database";

export function KidSwitcher() {
  const t = useTranslations("kidProfile");
  const tn = useTranslations("nav");
  const router = useRouter();

  // Active kid is resolved reactively via the shared store (the same source the
  // layout and home page read), so a switch here updates the whole view.
  const { kids: kidList, activeKid, activeKidId, needsPin } = useActiveKid();
  const kids = kidList ?? [];
  const unlockedKidIds = useActiveKidStore((s) => s.unlockedKidIds);
  const markUnlocked = useActiveKidStore((s) => s.markUnlocked);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Re-seal this kid's friend cards after they edit their look, so friends see
  // the new avatar/color. Debounced while tapping; flushed when the popover
  // closes or unmounts so a friend never keeps a stale card.
  const [cardRefresh] = useState(() =>
    createCardRefreshScheduler((pid) => {
      const session = useVaultStore.getState().session;
      const prof = useKidStore.getState().byId[pid];
      if (session && prof) void refreshFriendCards(prof, session).catch(() => {});
    }),
  );
  const flushCardRefresh = useCallback(() => cardRefresh.flush(), [cardRefresh]);

  useEffect(() => () => flushCardRefresh(), [flushCardRefresh]);

  const forceClose = useCallback(() => {
    setOpen(false);
    setPending(null);
    flushCardRefresh();
  }, [flushCardRefresh]);

  const closePopover = useCallback(() => {
    // While a locked profile is gated the popover can't be dismissed — the kid
    // must solve the puzzle (or switch to another profile) to continue.
    if (needsPin) return;
    forceClose();
  }, [needsPin, forceClose]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        closePopover();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closePopover]);

  // A gated profile forces the popover open (and keeps it open) so the kid can
  // solve the puzzle; otherwise it's the user's toggle.
  const popoverOpen = open || needsPin;

  // When gated, always show a puzzle (never the look editor for a locked
  // profile): fall back to the active kid's puzzle if nothing else is pending.
  const shownPendingId = pending ?? (needsPin ? activeKidId : null);
  const shownPendingKid = shownPendingId
    ? (kids.find((p) => p.id === shownPendingId) ?? null)
    : null;
  // Can back out of a puzzle only when it's for a *different* profile than the
  // gated active one (i.e. an optional switch, not the entry gate).
  const canCancelPuzzle = !!pending && pending !== activeKidId;

  function handleSwitch(kid: Kid) {
    // End Dodi session for the outgoing kid (fires the memory update); the
    // store persists cookies (active kid + locale) and marks the kid unlocked.
    switchActiveKid(
      {
        activeKid: clientState.activeKid,
        endVoiceSession: () => useDodiSessionStore.getState().endSession(),
      },
      kid,
    );
    forceClose();
    router.refresh();
  }

  function onPickKid(kid: Kid) {
    // Re-tapping the already-active, unlocked kid is a no-op.
    const action = kidPickAction(kid, { activeKidId, needsPin, unlockedKidIds });
    if (action === "puzzle") setPending(kid.id);
    else if (action === "switch") handleSwitch(kid);
  }

  /** Persist a look change for the active kid: optimistic + encrypted PATCH. */
  function updateLook(partial: Partial<AvatarConfig>) {
    const kid = activeKid;
    if (!kid) return;
    const sent = updateKidLook(
      { api: dodi, kids: clientState.kids, vault: clientState.vault },
      kid,
      partial,
    );
    if (!sent) return;
    // Propagate the new look to friends' cards (debounced across rapid taps).
    cardRefresh.schedule(kid.id);
  }

  if (kids.length === 0) {
    return <div className={kidSwitcher.empty} />;
  }

  const activeCfg: AvatarConfig = activeKid
    ? readAvatarConfig(activeKid.avatar_config)
    : { color: 0, avatar: null };
  const ringColor = KID_AVA_COLORS[activeCfg.color] ?? KID_AVA_COLORS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (popoverOpen ? closePopover() : setOpen(true))}
        className={cn(kidSwitcher.pill, kidSwitcher.pillText, kidSwitcher.webPill)}
        aria-label={tn("switchKid")}
      >
        {activeKid ? (
          <KidAvatar kid={activeKid} size={kidSwitcherSizes.pillAvatar} />
        ) : (
          <span className={kidSwitcher.pillAvatarEmpty} />
        )}
        {activeKid && (
          <span className={cn(kidSwitcher.pillName, kidSwitcher.webPillName)}>
            {activeKid.display_name}
          </span>
        )}
        <Icon
          name="chevron_down"
          size={kidSwitcher.chevron.size}
          className={cn(
            "text-faint",
            kidSwitcher.webChevron,
            popoverOpen && kidSwitcher.webChevronOpen,
          )}
        />
      </button>

      {popoverOpen && (
        <div
          role="dialog"
          aria-label={t("whosPlaying")}
          className={cn(kidSwitcher.popover, kidSwitcher.webPopover)}
        >
          <div className={cn(kidSwitcher.head, kidSwitcher.webHead)}>
            <div className={kidSwitcher.label}>
              {t("whosPlaying")}
            </div>
            {/* No close affordance while a locked profile is gated. */}
            {!needsPin && (
              <button
                onClick={closePopover}
                aria-label={t("close")}
                className={cn(
                  kidSwitcher.close,
                  kidSwitcher.closeText,
                  kidSwitcher.webClose,
                )}
              >
                <Icon name="close" size={kidSwitcherSizes.closeIcon} stroke={2.3} />
              </button>
            )}
          </div>

          <div className={cn(kidSwitcher.list, kidSwitcher.webList)}>
            {kids.map((p) => {
              const isActive = p.id === activeKidId;
              const isPending = p.id === shownPendingId;
              return (
                <button
                  key={p.id}
                  onClick={() => onPickKid(p)}
                  className={cn(
                    kidSwitcher.row,
                    kidSwitcher.webRow,
                    isActive && kidSwitcher.rowActive,
                    isPending && kidSwitcher.rowPending,
                  )}
                >
                  <KidAvatar kid={p} size={kidSwitcherSizes.rowAvatar} />
                  <span className={kidSwitcher.rowName}>
                    {p.display_name}
                  </span>
                  {isPending ? (
                    <Icon name="lock" size={19} className="text-faint" />
                  ) : isActive ? (
                    <Icon
                      name="check"
                      size={20}
                      stroke={2.6}
                      className="text-primary"
                    />
                  ) : parsePin(p) ? (
                    <Icon name="lock" size={16} className="text-faint/70" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className={kidSwitcher.divider} />

          {shownPendingKid ? (
            <div>
              <div className={cn(kidSwitcher.puzzleHead, kidSwitcher.webPuzzleHead)}>
                <div className={kidSwitcher.label}>
                  {t("secret", { name: shownPendingKid.display_name })}
                </div>
                {canCancelPuzzle && (
                  <button
                    onClick={() => setPending(null)}
                    className={cn(
                      kidSwitcher.cancel,
                      kidSwitcher.cancelText,
                      kidSwitcher.webCancel,
                    )}
                  >
                    {t("cancel")}
                  </button>
                )}
              </div>
              <div className={kidSwitcher.hint}>
                {t("secretHint")}
              </div>
              <AvatarPinPuzzle
                mode="solve"
                onSolve={(seq) => {
                  const ok = verifyAvatarPin(shownPendingKid, seq);
                  if (ok) {
                    setTimeout(() => {
                      if (
                        solvedPinAction(shownPendingKid.id, activeKidId) ===
                        "unlock"
                      ) {
                        // Entry unlock of the active profile — no switch.
                        markUnlocked(shownPendingKid.id);
                        forceClose();
                      } else {
                        handleSwitch(shownPendingKid);
                      }
                    }, PIN_SOLVED_DELAY_MS);
                  }
                  return ok;
                }}
              />
            </div>
          ) : activeKid ? (
            <>
              <div className={cn(kidSwitcher.lookHead, kidSwitcher.webLookHead)}>
                <KidAvatar
                  kid={activeKid}
                  size={kidSwitcherSizes.lookAvatar}
                  pad={kidSwitcherSizes.lookAvatarPad}
                />
                <div>
                  <div className={kidSwitcher.label}>
                    {t("look", { name: activeKid.display_name })}
                  </div>
                  <div className={kidSwitcher.lookHint}>
                    {t("lookHint")}
                  </div>
                </div>
              </div>

              <div className={cn(kidSwitcher.colors, kidSwitcher.webColors)}>
                {KID_AVA_COLORS.map((cc, i) => {
                  const sel = activeCfg.color === i;
                  return (
                    <button
                      key={i}
                      onClick={() => updateLook({ color: i })}
                      aria-label={t("colorLabel", { n: i + 1 })}
                      className={cn(kidSwitcher.color, kidSwitcher.webColor)}
                      style={{
                        background: cc.bg,
                        outlineStyle: "solid",
                        outlineColor: sel ? cc.fg : "transparent",
                      }}
                    >
                      <span
                        className={cn(kidSwitcher.colorDot, kidSwitcher.webColorDot)}
                        style={{
                          width: kidSwitcherSizes.colorDot,
                          height: kidSwitcherSizes.colorDot,
                          background: cc.fg,
                          transform: sel ? "scale(1.25)" : undefined,
                        }}
                      />
                    </button>
                  );
                })}
              </div>

              <div className={cn(kidSwitcher.grid, kidSwitcher.webGrid)}>
                {AVATAR_GROUPS.map((g) => (
                  <div key={g.key}>
                    <div className={cn(kidSwitcher.groupLabel, kidSwitcher.webGroupLabel)}>
                      {t(`group.${g.key}`)}
                    </div>
                    <div className={cn(kidSwitcher.gridRow, kidSwitcher.webGridRow)}>
                      {g.items.map((id) => {
                        const sel = activeCfg.avatar === id;
                        return (
                          <button
                            key={id}
                            onClick={() => updateLook({ avatar: id })}
                            aria-label={id}
                            className={cn(kidSwitcher.tile, kidSwitcher.webTile)}
                            style={{
                              background: ringColor.ring,
                              outlineStyle: "solid",
                              outlineColor: sel ? ringColor.fg : "transparent",
                            }}
                          >
                            <Image
                              src={avatarImage(id)!}
                              alt=""
                              width={64}
                              height={64}
                              unoptimized
                              className={cn(kidSwitcher.tileImage, kidSwitcher.webTileImage)}
                            />
                            {sel && (
                              <span
                                className={cn(
                                  kidSwitcher.tileCheck,
                                  kidSwitcher.tileCheckText,
                                  kidSwitcher.webTileCheck,
                                )}
                                style={{ background: ringColor.fg }}
                              >
                                <Icon name="check" size={kidSwitcherSizes.tileCheckIcon} stroke={3} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
