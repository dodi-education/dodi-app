"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import { locales, localePath, type Locale } from "@/lib/site";

const localeLabels: Record<Locale, string> = { en: "EN", de: "DE" };

/**
 * Language selector for the static site. The two locales live under separate root
 * layouts, so switching is a hard navigation to the other locale's path; the
 * choice is persisted in the NEXT_LOCALE cookie. No API call, no app dependency.
 */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
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

  function handleSelect(next: Locale) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    setOpen(false);
    if (next !== locale) window.location.assign(localePath[next]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Change language"
      >
        <Icon name="globe" className="h-4 w-4" />
        <span className="text-xs font-medium">{localeLabels[locale]}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[80px] rounded-md border bg-card p-1 shadow-md">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => handleSelect(l)}
              className={`flex w-full items-center rounded-sm px-3 py-1.5 text-sm transition-colors hover:bg-accent ${
                l === locale
                  ? "font-semibold text-primary"
                  : "text-card-foreground"
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
