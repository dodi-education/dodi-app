"use client";

import { useEffect, useRef, useState } from "react";

import { locales, localizePath, type Locale } from "@/lib/site";

const localeNames: Record<Locale, string> = { en: "English", de: "Deutsch" };
/** Short codes shown on the button; the dropdown still lists full names. */
const localeCodes: Record<Locale, string> = { en: "EN", de: "DE" };

/**
 * Header language selector, styled to match the design's `.lang-switch`
 * dropdown. The two locales live under separate static root layouts, so
 * switching is a hard navigation to the other locale's path; the choice is
 * persisted in the NEXT_LOCALE cookie. No API call, no app dependency.
 */
export function LangSwitch({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(next: Locale) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    setOpen(false);
    if (next !== locale) {
      const { pathname, search, hash } = window.location;
      window.location.assign(localizePath(pathname, next) + search + hash);
    }
  }

  return (
    <div className={`lang-switch${open ? " open" : ""}`} ref={ref}>
      <button
        type="button"
        className="ls-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language / Sprache"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg
          className="ls-globe"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span>{localeCodes[locale]}</span>
        <svg
          className="ls-caret"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div className="ls-menu" role="listbox">
        {locales.map((l) => (
          <button
            key={l}
            type="button"
            role="option"
            aria-selected={l === locale}
            onClick={() => select(l)}
          >
            {localeNames[l]}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
