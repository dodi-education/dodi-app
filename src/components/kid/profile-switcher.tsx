"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { useProfiles } from "@/hooks/use-profiles";
import { cn } from "@/lib/utils";
import { useDodiSessionStore } from "@/stores/dodi-session-store";

import type { Profile } from "@/types/database";

function getAvatarLabel(name: string): string {
  return name.length <= 5 ? name : name.slice(0, 2).toUpperCase();
}

function getAvatarTextSize(name: string): string {
  if (name.length <= 2) return "text-sm";
  if (name.length <= 3) return "text-xs";
  if (name.length <= 5) return "text-[10px]";
  return "text-xs";
}

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=86400`;
}

export function ProfileSwitcher() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { profiles: profileList } = useProfiles();
  const profiles = profileList ?? [];
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveActive() {
      const currentId = getCookie("dodi-active-profile") ?? null;
      if (cancelled) return;
      if (currentId) {
        setActiveProfileId(currentId);
      } else if (profileList && profileList.length > 0) {
        // No active profile cookie — default to the first profile
        setCookie("dodi-active-profile", profileList[0].id);
        setCookie("dodi-kid-locale", profileList[0].language ?? "en");
        setActiveProfileId(profileList[0].id);
      }
    }
    void resolveActive();
    return () => { cancelled = true; };
  }, [profileList]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  function handleSwitch(profile: Profile) {
    // End Dodi session for outgoing profile (fires memory update)
    useDodiSessionStore.getState().endSession();
    setCookie("dodi-active-profile", profile.id);
    setCookie("dodi-kid-locale", profile.language ?? "en");
    setActiveProfileId(profile.id);
    setOpen(false);
    router.refresh();
  }

  if (profiles.length === 0) {
    return <div className="h-10 w-10 rounded-full bg-primary-soft-2" />;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-1.5 pr-4 text-[15px] font-extrabold text-ink transition-colors hover:bg-white"
        aria-label={t("switchProfile")}
      >
        <span
          className={cn(
            "flex size-[34px] items-center justify-center rounded-full bg-primary-soft-2 font-extrabold text-primary",
            activeProfile
              ? getAvatarTextSize(activeProfile.display_name)
              : "text-xs",
          )}
        >
          {activeProfile ? getAvatarLabel(activeProfile.display_name) : "?"}
        </span>
        {activeProfile ? (
          <span className="max-w-[120px] truncate">
            {activeProfile.display_name}
          </span>
        ) : null}
      </button>
      {open && profiles.length > 1 && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[190px] rounded-2xl border bg-popover p-1.5 shadow-lg">
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId;
            return (
              <button
                key={profile.id}
                onClick={() => handleSwitch(profile)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition-colors hover:bg-accent",
                  isActive && "bg-accent/50",
                )}
              >
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft-2 font-extrabold text-primary",
                  getAvatarTextSize(profile.display_name),
                )}>
                  {getAvatarLabel(profile.display_name)}
                </span>
                <span className="flex-1 text-left">
                  {profile.display_name}
                </span>
                {isActive && (
                  <Icon name="check" className="h-4 w-4 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
