"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { AvatarPinPuzzle } from "@/components/kid/avatar-pin-puzzle";
import { KidAvatar } from "@/components/kid/kid-avatar";
import { Icon } from "@/components/shared/icon";
import { useProfiles } from "@/hooks/use-profiles";
import { dodi } from "@/lib/api";
import { refreshFriendCards } from "@/lib/friends";
import {
  AVATAR_GROUPS,
  KID_AVA_COLORS,
  PIN_LENGTH,
  avatarImage,
  readAvatarConfig,
  type AvatarConfig,
} from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { useProfileStore } from "@/stores/profile-store";
import { useVaultStore } from "@/stores/vault-store";
import { encryptProfileFields } from "@dodi/vault";

import type { Json, Profile } from "@dodi/types/database";

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=86400`;
}

/** The target profile's decrypted PIN sequence, or null when the puzzle is off. */
function parsePin(profile: Profile): string[] | null {
  if (!profile.avatar_pin) return null;
  try {
    const arr: unknown = JSON.parse(profile.avatar_pin);
    return Array.isArray(arr) && arr.length === PIN_LENGTH
      ? (arr as string[])
      : null;
  } catch {
    return null;
  }
}

export function ProfileSwitcher() {
  const t = useTranslations("kidProfile");
  const tn = useTranslations("nav");
  const router = useRouter();
  const { profiles: profileList } = useProfiles();
  const profiles = profileList ?? [];
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cardRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRefreshProfileId = useRef<string | null>(null);

  // Re-seal this kid's friend cards after they edit their look, so friends see
  // the new avatar/color. Debounced while tapping; flushed when the popover
  // closes or unmounts so a friend never keeps a stale card.
  const flushCardRefresh = useCallback(() => {
    if (cardRefreshTimer.current) {
      clearTimeout(cardRefreshTimer.current);
      cardRefreshTimer.current = null;
    }
    const pid = cardRefreshProfileId.current;
    cardRefreshProfileId.current = null;
    if (!pid) return;
    const session = useVaultStore.getState().session;
    const prof = useProfileStore.getState().byId[pid];
    if (session && prof) void refreshFriendCards(prof, session).catch(() => {});
  }, []);

  function scheduleCardRefresh(profileId: string) {
    cardRefreshProfileId.current = profileId;
    if (cardRefreshTimer.current) clearTimeout(cardRefreshTimer.current);
    cardRefreshTimer.current = setTimeout(flushCardRefresh, 1200);
  }

  useEffect(() => () => flushCardRefresh(), [flushCardRefresh]);

  useEffect(() => {
    let cancelled = false;
    async function resolveActive() {
      const currentId = getCookie("dodi-active-profile") ?? null;
      if (cancelled) return;
      if (currentId) {
        setActiveProfileId(currentId);
      } else if (profileList && profileList.length > 0) {
        setCookie("dodi-active-profile", profileList[0].id);
        setCookie("dodi-kid-locale", profileList[0].language ?? "en");
        setActiveProfileId(profileList[0].id);
      }
    }
    void resolveActive();
    return () => {
      cancelled = true;
    };
  }, [profileList]);

  const closePopover = useCallback(() => {
    setOpen(false);
    setPending(null);
    flushCardRefresh();
  }, [flushCardRefresh]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        closePopover();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closePopover]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const pendingProfile = pending
    ? profiles.find((p) => p.id === pending)
    : null;

  function handleSwitch(profile: Profile) {
    // End Dodi session for the outgoing profile (fires the memory update).
    useDodiSessionStore.getState().endSession();
    setCookie("dodi-active-profile", profile.id);
    setCookie("dodi-kid-locale", profile.language ?? "en");
    setActiveProfileId(profile.id);
    closePopover();
    router.refresh();
  }

  function onPickProfile(profile: Profile) {
    if (profile.id === activeProfileId) return;
    if (parsePin(profile)) {
      setPending(profile.id);
    } else {
      handleSwitch(profile);
    }
  }

  /** Persist a look change for the active profile: optimistic + encrypted PATCH. */
  function updateLook(partial: Partial<AvatarConfig>) {
    const profile = activeProfile;
    if (!profile) return;
    const cfg: AvatarConfig = {
      ...readAvatarConfig(profile.avatar_config),
      ...partial,
    };
    const cfgJson: Json = { color: cfg.color, avatar: cfg.avatar };
    useProfileStore.getState().patchLocal(profile.id, { avatar_config: cfgJson });

    const session = useVaultStore.getState().session;
    if (!session) return;
    const enc = encryptProfileFields(session, { avatar_config: cfgJson });
    void dodi.request(`/api/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_config: enc.avatar_config }),
    });
    // Propagate the new look to friends' cards (debounced across rapid taps).
    scheduleCardRefresh(profile.id);
  }

  if (profiles.length === 0) {
    return <div className="h-10 w-10 rounded-full bg-primary-soft-2" />;
  }

  const activeCfg: AvatarConfig = activeProfile
    ? readAvatarConfig(activeProfile.avatar_config)
    : { color: 0, avatar: null };
  const ringColor = KID_AVA_COLORS[activeCfg.color] ?? KID_AVA_COLORS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (open ? closePopover() : setOpen(true))}
        className="flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-1.5 pr-4 text-[15px] font-extrabold text-ink transition hover:bg-white"
        aria-label={tn("switchProfile")}
      >
        {activeProfile ? (
          <KidAvatar profile={activeProfile} size={34} />
        ) : (
          <span className="size-[34px] rounded-full bg-primary-soft-2" />
        )}
        {activeProfile && (
          <span className="max-w-[120px] truncate">
            {activeProfile.display_name}
          </span>
        )}
        <Icon
          name="chevron_down"
          size={16}
          className={cn("text-faint transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("whosPlaying")}
          className="absolute left-0 top-full z-50 mt-2.5 w-[400px] max-w-[calc(100vw-2rem)] rounded-[22px] bg-white p-4 shadow-[0_20px_56px_rgba(34,56,78,0.24)]"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-faint">
              {t("whosPlaying")}
            </div>
            <button
              onClick={closePopover}
              aria-label={t("close")}
              className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-border hover:text-ink"
            >
              <Icon name="close" size={15} stroke={2.3} />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {profiles.map((p) => {
              const isActive = p.id === activeProfileId;
              const isPending = p.id === pending;
              return (
                <button
                  key={p.id}
                  onClick={() => onPickProfile(p)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-2.5 py-[7px] text-left transition-colors hover:bg-muted",
                    isActive && "bg-primary-soft",
                    isPending && "bg-muted",
                  )}
                >
                  <KidAvatar profile={p} size={42} />
                  <span className="flex-1 text-base font-extrabold text-ink">
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

          <div className="my-3 h-px bg-border" />

          {pending && pendingProfile ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-faint">
                  {t("secret", { name: pendingProfile.display_name })}
                </div>
                <button
                  onClick={() => setPending(null)}
                  className="rounded-[9px] px-2 py-1 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
                >
                  {t("cancel")}
                </button>
              </div>
              <div className="mb-4 text-[13px] font-semibold text-muted-foreground">
                {t("secretHint")}
              </div>
              <AvatarPinPuzzle
                mode="solve"
                onSolve={(seq) => {
                  const pin = parsePin(pendingProfile);
                  const ok =
                    !!pin &&
                    pin.length === seq.length &&
                    pin.every((a, i) => a === seq[i]);
                  if (ok) setTimeout(() => handleSwitch(pendingProfile), 250);
                  return ok;
                }}
              />
            </div>
          ) : activeProfile ? (
            <>
              <div className="mb-3 flex items-center gap-3.5">
                <KidAvatar profile={activeProfile} size={76} pad={5} />
                <div>
                  <div className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-faint">
                    {t("look", { name: activeProfile.display_name })}
                  </div>
                  <div className="mt-[3px] text-[13px] font-semibold text-muted-foreground">
                    {t("lookHint")}
                  </div>
                </div>
              </div>

              <div className="mb-3.5 flex gap-2.5">
                {KID_AVA_COLORS.map((cc, i) => {
                  const sel = activeCfg.color === i;
                  return (
                    <button
                      key={i}
                      onClick={() => updateLook({ color: i })}
                      aria-label={t("colorLabel", { n: i + 1 })}
                      className="flex size-[34px] items-center justify-center rounded-full outline-[2.5px] outline-offset-2 transition hover:scale-110"
                      style={{
                        background: cc.bg,
                        outlineStyle: "solid",
                        outlineColor: sel ? cc.fg : "transparent",
                      }}
                    >
                      <span
                        className="rounded-full transition-transform"
                        style={{
                          width: 15,
                          height: 15,
                          background: cc.fg,
                          transform: sel ? "scale(1.25)" : undefined,
                        }}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="-mx-1 max-h-[244px] overflow-y-auto px-1">
                {AVATAR_GROUPS.map((g) => (
                  <div key={g.key}>
                    <div className="mx-0.5 mb-2 mt-3 text-[12px] font-extrabold uppercase tracking-[0.05em] text-faint first:mt-0.5">
                      {t(`group.${g.key}`)}
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {g.items.map((id) => {
                        const sel = activeCfg.avatar === id;
                        return (
                          <button
                            key={id}
                            onClick={() => updateLook({ avatar: id })}
                            aria-label={id}
                            className="relative aspect-square overflow-hidden rounded-[16px] p-1 outline-[2.5px] -outline-offset-[2.5px] transition hover:-translate-y-0.5"
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
                              className="h-full w-full rounded-[11px] object-contain"
                            />
                            {sel && (
                              <span
                                className="absolute bottom-[3px] right-[3px] flex size-[18px] items-center justify-center rounded-full text-white shadow"
                                style={{ background: ringColor.fg }}
                              >
                                <Icon name="check" size={12} stroke={3} />
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
