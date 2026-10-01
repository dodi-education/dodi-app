/**
 * Date/time preference controls (date format, time format, timezone) with a
 * live preview (web: components/parent/date-time-fields). Pure UI: state and
 * persistence live in the caller.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import {
  type DateFormatPref,
  type DateStyleId,
  type TimeStyleId,
} from "@dodi/intl/prefs";
import { formatDate, formatDateTime, formatTime } from "@dodi/intl/format";

import { ChoiceList, type Choice } from "@/components/ui/choice-list";
import { Text, TextField } from "@/components/ui";

// Fixed sample instant (24 Jun 2026, 15:30 UTC) for the examples and preview.
const SAMPLE = new Date("2026-06-24T15:30:00Z");
/** Timezone matches shown at once; typing narrows the list. */
const MAX_ZONE_MATCHES = 8;

/** Every IANA zone the runtime knows; the device zone at least. */
function listTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  try {
    const zones = intl.supportedValuesOf?.("timeZone") ?? [];
    if (zones.length > 0) return zones;
  } catch {
    // Older engines: fall through to the device zone.
  }
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return device ? [device] : [];
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
  const [zoneQuery, setZoneQuery] = useState("");
  const allZones = useMemo(listTimeZones, []);

  const zone = timeZone || basePref.timeZone;
  const ex = (style: DateStyleId): string =>
    ` (${formatDate(SAMPLE, { locale, pref: { dateStyle: style, timeStyle: "none", timeZone: zone } })})`;
  const exTime = (style: TimeStyleId): string =>
    ` (${formatTime(SAMPLE, { locale, pref: { dateStyle: "numeric", timeStyle: style, timeZone: zone } })})`;
  const inherit: Choice<"">[] = allowInherit ? [{ value: "", label: t("dateInherit") }] : [];

  const dateChoices: Choice<DateStyleId | "">[] = [
    ...inherit,
    { value: "numeric", label: `${t("dateFormatLocale")}${ex("numeric")}` },
    { value: "dmy_slash", label: `DD/MM/YYYY${ex("dmy_slash")}` },
    { value: "mdy_slash", label: `MM/DD/YYYY${ex("mdy_slash")}` },
    { value: "dmy_dot", label: `DD.MM.YYYY${ex("dmy_dot")}` },
    { value: "ymd_dash", label: `YYYY-MM-DD${ex("ymd_dash")}` },
    { value: "long", label: `${t("dateFormatLong")}${ex("long")}` },
  ];
  const timeChoices: Choice<TimeStyleId | "">[] = [
    ...inherit,
    { value: "24h", label: `${t("timeFormat24h")}${exTime("24h")}` },
    { value: "12h", label: `${t("timeFormat12h")}${exTime("12h")}` },
    { value: "none", label: t("timeFormatNone") },
  ];

  const query = zoneQuery.trim().toLowerCase().replace(/\s+/g, "_");
  const matches = query
    ? allZones.filter((tz) => tz.toLowerCase().includes(query)).slice(0, MAX_ZONE_MATCHES)
    : [];
  const isExplicitZone = timeZone !== "" && timeZone !== "auto";
  const zoneChoices: Choice<string>[] = [
    ...inherit,
    ...(allowAuto ? [{ value: "auto", label: t("timezoneAuto") }] : []),
    // Keep the chosen zone visible whatever the search shows.
    ...(isExplicitZone && !matches.includes(timeZone) ? [{ value: timeZone, label: timeZone }] : []),
    ...matches.map((tz) => ({ value: tz, label: tz })),
  ];

  const previewPref: DateFormatPref = {
    dateStyle: (dateStyle || basePref.dateStyle) as DateStyleId,
    timeStyle: (timeStyle || basePref.timeStyle) as TimeStyleId,
    timeZone: zone,
  };

  return (
    <View className="gap-4">
      <ChoiceList label={t("dateFormat")} choices={dateChoices} value={dateStyle} onChange={onDateStyle} />
      <ChoiceList label={t("timeFormat")} choices={timeChoices} value={timeStyle} onChange={onTimeStyle} />
      <View className="gap-2">
        <TextField
          label={t("timezone")}
          value={zoneQuery}
          onChangeText={setZoneQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Europe/Vienna"
        />
        <ChoiceList
          label={t("timezone")}
          isLabelHidden
          hint={t("timezoneHint")}
          choices={zoneChoices}
          value={timeZone}
          onChange={onTimeZone}
        />
      </View>
      <View className="gap-1">
        <Text variant="label">{t("datePreviewLabel")}</Text>
        <Text className="font-semibold">{formatDateTime(SAMPLE, { locale, pref: previewPref })}</Text>
      </View>
    </View>
  );
}
