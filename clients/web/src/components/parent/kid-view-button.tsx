"use client";

import { dodi } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";

export function KidViewButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("nav");
  const router = useRouter();

  async function handleSwitchToKid(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle modified clicks (ctrl/cmd-click, middle-click,
    // "open in new tab") natively instead of intercepting the navigation.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    // Fetch profiles to resolve active profile's language
    const response = await dodi.request("/api/profiles");
    if (response.ok) {
      const profiles = await response.json();
      if (profiles.length > 0) {
        // Keep the last-used profile if it still exists, otherwise default to first
        const existing = document.cookie.match(
          /(?:^|; )dodi-active-profile=([^;]*)/,
        );
        const lastUsedId = existing ? decodeURIComponent(existing[1]) : null;
        const profile =
          profiles.find((p: { id: string }) => p.id === lastUsedId) ??
          profiles[0];
        document.cookie = `dodi-active-profile=${profile.id}; path=/; max-age=86400`;
        const kidLocale = profile.language ?? "en";
        document.cookie = `dodi-kid-locale=${kidLocale}; path=/; max-age=86400`;
      }
    }
    document.cookie = "dodi-view=kid; path=/; max-age=86400";
    router.push("/home");
    router.refresh();
  }

  if (compact) {
    return (
      <a
        href="/home"
        onClick={handleSwitchToKid}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong bg-card px-2 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Icon name="games" size={14} />
        {t("kidView")}
      </a>
    );
  }

  return (
    <a
      href="/home"
      onClick={handleSwitchToKid}
      className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border-strong bg-card px-2.5 py-2 text-[13.5px] font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <Icon name="games" size={15} />
      {t("openKidView")}
    </a>
  );
}
