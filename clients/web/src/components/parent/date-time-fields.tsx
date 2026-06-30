"use client";

/**
 * Presentational date/time preference controls (date format, time format,
 * timezone) plus a live preview. Shared by the account settings section and the
 * per-kid editor. State and persistence live in the parent; this component
 * is pure UI.
 *
 * Option labels show a locale-aware example. Examples/preview are computed only
 * after mount because an "automatic" timezone renders differently on the server
 * (its zone) than the browser — gating avoids a hydration mismatch.
 */
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldRow } from "@/components/parent/rows";
import {
  formatDate,
  formatDateTime,
  formatTime,
  type DateFormatPref,
  type DateStyleId,
  type TimeStyleId,
} from "@dodi/intl";

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-[color,box-shadow,border-color] hover:border-faint focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary-soft-2 sm:w-[250px]";

// Fixed sample instant (24 Jun 2026, 15:30 UTC) used for previews/examples.
const SAMPLE = new Date("2026-06-24T15:30:00Z");

function listTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}
const TIME_ZONES = listTimeZones();

export interface DateTimeFieldsProps {
  /** "" means inherit (only when `allowInherit`). */
  dateStyle: DateStyleId | "";
  timeStyle: TimeStyleId | "";
  /** "", "auto", or an IANA id. */
  timeZone: string;
  onDateStyle: (value: DateStyleId | "") => void;
  onTimeStyle: (value: TimeStyleId | "") => void;
  onTimeZone: (value: string) => void;
  /** Offer an "Inherit from account" option (per-kid editor). */
  allowInherit?: boolean;
  /** Offer the "Automatic (device)" timezone option (account settings). */
  allowAuto?: boolean;
  /** Resolved fallback used for the preview when a field inherits. */
  basePref: DateFormatPref;
}

export function DateTimeFields({
  dateStyle,
  timeStyle,
  timeZone,
  onDateStyle,
  onTimeStyle,
  onTimeZone,
  allowInherit = false,
  allowAuto = true,
  basePref,
}: DateTimeFieldsProps) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const zone = timeZone || basePref.timeZone;
  const ex = (style: DateStyleId): string =>
    mounted
      ? ` (${formatDate(SAMPLE, { locale, pref: { dateStyle: style, timeStyle: "none", timeZone: zone } })})`
      : "";
  const exTime = (style: TimeStyleId): string =>
    mounted
      ? ` (${formatTime(SAMPLE, { locale, pref: { dateStyle: "numeric", timeStyle: style, timeZone: zone } })})`
      : "";

  const previewPref: DateFormatPref = {
    dateStyle: (dateStyle || basePref.dateStyle) as DateStyleId,
    timeStyle: (timeStyle || basePref.timeStyle) as TimeStyleId,
    timeZone: zone,
  };
  const preview = mounted ? formatDateTime(SAMPLE, { locale, pref: previewPref }) : "";

  return (
    <>
      <FieldRow label={t("dateFormat")} htmlFor="date-style">
        <select
          id="date-style"
          className={selectClassName}
          value={dateStyle}
          onChange={(e) => onDateStyle(e.target.value as DateStyleId | "")}
        >
          {allowInherit && <option value="">{t("dateInherit")}</option>}
          <option value="numeric">
            {t("dateFormatLocale")}
            {ex("numeric")}
          </option>
          <option value="dmy_slash">DD/MM/YYYY{ex("dmy_slash")}</option>
          <option value="mdy_slash">MM/DD/YYYY{ex("mdy_slash")}</option>
          <option value="dmy_dot">DD.MM.YYYY{ex("dmy_dot")}</option>
          <option value="ymd_dash">YYYY-MM-DD{ex("ymd_dash")}</option>
          <option value="long">
            {t("dateFormatLong")}
            {ex("long")}
          </option>
        </select>
      </FieldRow>

      <FieldRow label={t("timeFormat")} htmlFor="time-style">
        <select
          id="time-style"
          className={selectClassName}
          value={timeStyle}
          onChange={(e) => onTimeStyle(e.target.value as TimeStyleId | "")}
        >
          {allowInherit && <option value="">{t("dateInherit")}</option>}
          <option value="24h">
            {t("timeFormat24h")}
            {exTime("24h")}
          </option>
          <option value="12h">
            {t("timeFormat12h")}
            {exTime("12h")}
          </option>
          <option value="none">{t("timeFormatNone")}</option>
        </select>
      </FieldRow>

      <FieldRow label={t("timezone")} hint={t("timezoneHint")} htmlFor="timezone">
        <select
          id="timezone"
          className={selectClassName}
          value={timeZone}
          onChange={(e) => onTimeZone(e.target.value)}
        >
          {allowInherit && <option value="">{t("dateInherit")}</option>}
          {allowAuto && <option value="auto">{t("timezoneAuto")}</option>}
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </FieldRow>

      <FieldRow label={t("datePreviewLabel")}>
        <span className="text-sm font-semibold text-ink">{preview}</span>
      </FieldRow>
    </>
  );
}
