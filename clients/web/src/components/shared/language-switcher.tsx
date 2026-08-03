"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

import { Icon } from "@/components/shared/icon";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { dodi } from "@/lib/api";
import { useAccountStore } from "@/stores/account-store";

const localeLabels: Record<Locale, string> = {
  en: "EN",
  de: "DE",
};

function setLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
}

/** The one page family with per-locale URLs: the public game pages. */
const PUBLIC_GAME_PATH_RE = /^\/games\/[^/]+$/;

/**
 * On a public game page — prefixed (/{locale}/games/…) or not (/games/…) —
 * switching the language means NAVIGATING to the sibling URL, default locale
 * unprefixed, others prefixed (mirrors lib/public-game-urls): the language
 * versions are separately addressable pages, and switching should move
 * between them, not vary one URL by cookie. Returns null on app pages, which
 * have no per-locale URLs — there the cookie + refresh flow applies.
 */
function localizedPublicPath(pathname: string, next: Locale): string | null {
  const [, first, ...rest] = pathname.split("/");
  const prefixed = locales.includes(first as Locale);
  const bare = prefixed ? `/${rest.join("/")}` : pathname;
  if (!prefixed && !PUBLIC_GAME_PATH_RE.test(bare)) return null;
  return next === defaultLocale ? bare : `/${next}${bare}`;
}

/**
 * Best-effort persist of the parent's UI language to their account, so the
 * choice follows them across devices (the cookie above is only a per-device
 * cache). On public pages there's no session, so the request 401s — we swallow
 * that and keep the cookie-only behaviour.
 */
function persistLocale(locale: Locale) {
  void dodi
    .request("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: locale }),
    })
    .then((res) => {
      // Mirror into the shared account cache (no-op when signed out).
      if (res.ok) useAccountStore.getState().patchLocal({ language: locale });
    })
    .catch(() => {});
}

export function LanguageSwitcher({ dropUp = false }: { dropUp?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(newLocale: Locale) {
    setLocaleCookie(newLocale);
    persistLocale(newLocale);
    setOpen(false);
    const localizedTarget = localizedPublicPath(pathname, newLocale);
    if (localizedTarget && localizedTarget !== pathname) {
      router.push(localizedTarget);
    }
    // Always refresh, even after a push: a soft navigation re-renders the
    // page but reuses the cached ROOT layout, whose NextIntlClientProvider
    // (the source of useLocale for this switcher and every client component)
    // would otherwise keep serving the old locale until a hard reload.
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Change language"
      >
        <Icon name="globe" className="h-4 w-4" />
        <span className="text-xs font-medium">{localeLabels[locale as Locale]}</span>
      </button>
      {open && (
        <div
          className={`absolute right-0 z-50 min-w-[80px] rounded-md border bg-popover p-1 shadow-md ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => handleSelect(l)}
              className={`flex w-full items-center rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-accent ${
                l === locale ? "font-semibold text-primary" : "text-popover-foreground"
              }`}
            >
              {localeLabels[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
