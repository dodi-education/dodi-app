/**
 * Date/time preference controls (date format, time format, timezone) with a
 * live preview (web: components/parent/date-time-fields). Pure UI: state and
 * persistence live in the caller. Renders FieldRows for a parent `Section`;
 * the rows after the first carry the Section's divider themselves, since the
 * Section sees this component as a single child.
 */
import { useLocale, useTranslations } from "use-intl";
import { section } from "@dodi/ui-recipes";
import { listTimeZones } from "@dodi/client-state/date-preferences";
import {
  type DateFormatPref,
  type DateStyleId,
  type TimeStyleId,
} from "@dodi/intl/prefs";
import { formatDate, formatDateTime, formatTime } from "@dodi/intl/format";

import { FieldRow } from "@/components/parent/rows";
import { Select, type SelectOption, Text } from "@/components/ui";

// Fixed sample instant (24 Jun 2026, 15:30 UTC) for the examples and preview.
const SAMPLE = new Date("2026-06-24T15:30:00Z");

let cachedTimeZones: string[] | null = null;

/**
 * Every IANA zone the runtime knows; the device zone at least (older engines).
 * Computed on first use, not at module load: on Hermes `supportedValuesOf` is
 * the intl-polyfills one, which probes each zone with a DateTimeFormat, and
 * Expo Router loads this module at app start.
 */
function timeZones(): string[] {
  if (cachedTimeZones) return cachedTimeZones;
  const zones = listTimeZones();
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  cachedTimeZones = zones.length > 0 ? zones : device ? [device] : [];
  return cachedTimeZones;
}

export interface DateTimeFieldsProps {
  /** "" means inherit (only with `allowInherit`). */
  dateStyle: DateStyleId | "";
  timeStyle: TimeStyleId | "";
  /** "", "auto", or an IANA id. */
  timeZone: string;
  onDateStyle: (value: DateStyleId | "") => void;
  onTimeStyle: (value: TimeStyleId | "") => void;
  onTimeZone: (value: string) => void;
  /** Offer an "Inherit from account" option (per-kid editor). */
  allowInherit?: boolean;
  /** Offer the "Automatic (device)" timezone option. */
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

  const zone = timeZone || basePref.timeZone;
  const ex = (style: DateStyleId): string =>
    ` (${formatDate(SAMPLE, { locale, pref: { dateStyle: style, timeStyle: "none", timeZone: zone } })})`;
  const exTime = (style: TimeStyleId): string =>
    ` (${formatTime(SAMPLE, { locale, pref: { dateStyle: "numeric", timeStyle: style, timeZone: zone } })})`;
  const inherit: SelectOption<"">[] = allowInherit ? [{ value: "", label: t("dateInherit") }] : [];

  const dateOptions: SelectOption<DateStyleId | "">[] = [
    ...inherit,
    { value: "numeric", label: `${t("dateFormatLocale")}${ex("numeric")}` },
    { value: "dmy_slash", label: `DD/MM/YYYY${ex("dmy_slash")}` },
    { value: "mdy_slash", label: `MM/DD/YYYY${ex("mdy_slash")}` },
    { value: "dmy_dot", label: `DD.MM.YYYY${ex("dmy_dot")}` },
    { value: "ymd_dash", label: `YYYY-MM-DD${ex("ymd_dash")}` },
    { value: "long", label: `${t("dateFormatLong")}${ex("long")}` },
  ];
  const timeOptions: SelectOption<TimeStyleId | "">[] = [
    ...inherit,
    { value: "24h", label: `${t("timeFormat24h")}${exTime("24h")}` },
    { value: "12h", label: `${t("timeFormat12h")}${exTime("12h")}` },
    { value: "none", label: t("timeFormatNone") },
  ];
  const zones = timeZones();
  // A stored zone this runtime doesn't list still shows as selected.
  const isUnlistedZone = timeZone !== "" && timeZone !== "auto" && !zones.includes(timeZone);
  const zoneOptions: SelectOption<string>[] = [
    ...inherit,
    ...(allowAuto ? [{ value: "auto", label: t("timezoneAuto") }] : []),
    ...(isUnlistedZone ? [{ value: timeZone, label: timeZone }] : []),
    ...zones.map((tz) => ({ value: tz, label: tz })),
  ];

  const previewPref: DateFormatPref = {
    dateStyle: (dateStyle || basePref.dateStyle) as DateStyleId,
    timeStyle: (timeStyle || basePref.timeStyle) as TimeStyleId,
    timeZone: zone,
  };

  return (
    <>
      <FieldRow label={t("dateFormat")}>
        <Select label={t("dateFormat")} value={dateStyle} options={dateOptions} onValueChange={onDateStyle} />
      </FieldRow>

      <FieldRow label={t("timeFormat")} className={section.divider}>
        <Select label={t("timeFormat")} value={timeStyle} options={timeOptions} onValueChange={onTimeStyle} />
      </FieldRow>

      <FieldRow label={t("timezone")} hint={t("timezoneHint")} className={section.divider}>
        <Select label={t("timezone")} value={timeZone} options={zoneOptions} onValueChange={onTimeZone} />
      </FieldRow>

      <FieldRow label={t("datePreviewLabel")} className={section.divider}>
        <Text className="text-sm font-semibold text-ink">
          {formatDateTime(SAMPLE, { locale, pref: previewPref })}
        </Text>
      </FieldRow>
    </>
  );
}
