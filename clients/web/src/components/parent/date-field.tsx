"use client";

/**
 * A date input that displays and accepts dates in the family's configured date
 * format — the resolved `dateStyle` from `useDateFormat()` (kid → account →
 * locale default). A native `<input type="date">` renders in the *browser/OS*
 * locale, ignoring both the app language and the account setting; this replaces
 * it with a formatted, typeable text field while keeping a native calendar
 * (opened from the trailing button) for picking.
 *
 * The value is always canonical `YYYY-MM-DD` ("" when empty); only the on-screen
 * representation follows the preference.
 */
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { useDateFormat } from "@/components/providers/date-format-provider";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  dateFieldMask,
  dateFieldPlaceholder,
  formatDateField,
  parseDateField,
} from "@dodi/intl";

export interface DateFieldProps {
  id?: string;
  /** Canonical `YYYY-MM-DD`, or `""` when unset. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  min?: string;
  max?: string;
  "aria-invalid"?: boolean;
}

export function DateField({
  id,
  value,
  onChange,
  className,
  min,
  max,
  "aria-invalid": ariaInvalid,
}: DateFieldProps) {
  const t = useTranslations("common");
  const { pref, locale } = useDateFormat();
  const mask = useMemo(
    () => dateFieldMask(locale, pref.dateStyle),
    [locale, pref.dateStyle],
  );

  const nativeRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatDateField(value, mask));
  const [invalid, setInvalid] = useState(false);

  // Re-sync the visible text from the canonical value (external set, calendar
  // pick, or a format change) — but never while the user is mid-edit.
  useEffect(() => {
    if (!focused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(formatDateField(value, mask));
    }
  }, [value, mask, focused]);

  function commit(raw: string, reformat: boolean) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setInvalid(false);
      onChange("");
      return;
    }
    const iso = parseDateField(trimmed, mask);
    if (iso) {
      setInvalid(false);
      onChange(iso);
      if (reformat) setText(formatDateField(iso, mask));
    } else if (reformat) {
      // Keep the bad text visible (flagged) so the user can fix it on blur.
      setInvalid(true);
    }
  }

  function openPicker() {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // Fall through to focus/click below.
      }
    }
    el.focus();
    el.click();
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={dateFieldPlaceholder(mask)}
        aria-invalid={ariaInvalid || invalid || undefined}
        className="pr-10"
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value, false); // keep canonical live (Enter-to-submit)
        }}
        onBlur={() => {
          setFocused(false);
          commit(text, true);
        }}
      />
      <button
        type="button"
        aria-label={t("openCalendar")}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-faint transition-colors hover:text-ink"
        onClick={openPicker}
      >
        <Icon name="calendar" size={18} />
      </button>
      {/* Hidden native input: the calendar source. Laid out (not display:none) so
          showPicker() can anchor to it. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          setInvalid(false);
          onChange(e.target.value);
        }}
        className="pointer-events-none absolute inset-y-0 right-0 w-px opacity-0"
      />
    </div>
  );
}
