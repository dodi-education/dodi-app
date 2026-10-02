/**
 * The OS calendar for a date field: the app's stand-in for the web's hidden
 * `<input type="date">` that DateField opens from its calendar button. Android
 * shows its own dialog; iOS shows the inline calendar in the kit's bottom
 * Sheet. Values are canonical `YYYY-MM-DD` calendar dates (no timezone).
 */
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { COLORS } from "@dodi/design-tokens";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** `YYYY-MM-DD` → a local Date at midnight (today when unset or malformed). */
function toDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

/** A local Date → `YYYY-MM-DD`. */
function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface NativeDatePickerProps {
  isOpen: boolean;
  /** Canonical `YYYY-MM-DD`, or "" (opens on today). */
  value: string;
  min?: string;
  max?: string;
  locale: string;
  /** Sheet title / accessible name (iOS). */
  title: string;
  /** The iOS sheet's confirm label. */
  doneLabel: string;
  onPick: (value: string) => void;
  onClose: () => void;
}

export function NativeDatePicker({
  isOpen,
  value,
  min,
  max,
  locale,
  title,
  doneLabel,
  onPick,
  onClose,
}: NativeDatePickerProps) {
  useEffect(() => {
    if (!isOpen || Platform.OS !== "android") return;
    DateTimePickerAndroid.open({
      value: toDate(value),
      mode: "date",
      minimumDate: min ? toDate(min) : undefined,
      maximumDate: max ? toDate(max) : undefined,
      onChange: (event, date) => {
        if (event.type === "set" && date) onPick(toIso(date));
        onClose();
      },
    });
    // Opens once per isOpen; the callbacks are stable for that open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (Platform.OS === "android") return null;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title}>
      {/* Mounted per open, so the calendar starts on the field's value. */}
      {isOpen ? (
        <IosCalendar
          value={value}
          min={min}
          max={max}
          locale={locale}
          doneLabel={doneLabel}
          onPick={(picked) => {
            onPick(picked);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

function IosCalendar({
  value,
  min,
  max,
  locale,
  doneLabel,
  onPick,
}: Pick<NativeDatePickerProps, "value" | "min" | "max" | "locale" | "doneLabel" | "onPick">) {
  const [draft, setDraft] = useState(() => toDate(value));
  return (
    <>
      <View className="items-center">
        <DateTimePicker
          value={draft}
          mode="date"
          display="inline"
          locale={locale}
          accentColor={COLORS.primary}
          themeVariant="light"
          minimumDate={min ? toDate(min) : undefined}
          maximumDate={max ? toDate(max) : undefined}
          onChange={(_event, date) => {
            if (date) setDraft(date);
          }}
        />
      </View>
      <Button onPress={() => onPick(toIso(draft))}>{doneLabel}</Button>
    </>
  );
}
