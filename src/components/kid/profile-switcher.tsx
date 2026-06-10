"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfiles() {
      const currentId = getCookie("dodi-active-profile") ?? null;
      const response = await fetch("/api/profiles");
      if (cancelled) return;
      if (response.ok) {
        const data: Profile[] = await response.json();
        if (cancelled) return;
        setProfiles(data);
        if (currentId) {
          setActiveProfileId(currentId);
        } else if (data.length > 0) {
          // No active profile cookie — default to first profile
          setCookie("dodi-active-profile", data[0].id);
          setCookie("dodi-kid-locale", data[0].language ?? "en");
          setActiveProfileId(data[0].id);
        }
      }
    }
    loadProfiles();
    return () => { cancelled = true; };
  }, []);

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
