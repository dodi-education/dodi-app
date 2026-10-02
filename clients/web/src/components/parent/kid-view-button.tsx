"use client";

import { useTranslations } from "next-intl";
import { enterKidView } from "@dodi/client-state/kid-view";

import { Icon } from "@/components/shared/icon";
import { readActiveKidCookie, writeActiveKidCookies } from "@/lib/active-kid";
import { clientState } from "@/lib/client-state";
import { clearParentUnlocked, markParentUnlocked } from "@/lib/parent-lock";

export function KidViewButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("nav");

  async function handleSwitchToKid(e: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle modified clicks (ctrl/cmd-click, middle-click,
    // "open in new tab") natively instead of intercepting the navigation.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    // Keep the last-used kid if it still exists, otherwise default to the
    // first; persists it (+ its language) in the kid cookies. Leaving for kid
    // view re-locks the parent area on this device. A locked vault / failed
    // fetch switches views anyway.
    await enterKidView({
      kids: clientState.kids,
      persistence: {
        readActiveKidId: readActiveKidCookie,
        writeActiveKid: (kid) =>
          writeActiveKidCookies({ id: kid.id, language: kid.language ?? "en" }),
      },
      parentLock: { markUnlocked: markParentUnlocked, clear: clearParentUnlocked },
    });
    document.cookie = "dodi-view=kid; path=/; max-age=86400";
    // Full-document navigation, not router.push + refresh. The UI locale is
    // resolved server-side in the root layout from the cookies set above (see
    // i18n/resolve-locale.ts). Parent and kid routes share that root layout, so
    // an SPA navigation keeps the previous view's NextIntlClientProvider mounted
    // and the UI stays in the parent's language. A full load re-resolves the
    // locale, so the kid's language takes effect.
    window.location.assign("/home");
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
