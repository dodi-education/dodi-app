/**
 * A date input in the family's configured date format (web:
 * components/parent/date-field): a typeable, masked text field plus a trailing
 * calendar button that opens the OS date picker (the web's hidden
 * `<input type="date">`). The value is always canonical `YYYY-MM-DD` ("" when
 * empty); only the on-screen text follows the preference.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { dateFieldMask, dateFieldPlaceholder, formatDateField, parseDateField } from "@dodi/intl/format";

import { NativeDatePicker } from "@/adapters/date-picker";
import { Icon, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAccountDateFormat } from "@/lib/date-format";

export interface DateFieldProps {
  /** Canonical `YYYY-MM-DD`, or `""` when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (web: the FieldRow label via htmlFor). */
  accessibilityLabel: string;
  className?: string;
  min?: string;
  max?: string;
  isInvalid?: boolean;
}

export function DateField({ value, onChange, accessibilityLabel, className, min, max, isInvalid }: DateFieldProps) {
  const t = useTranslations("common");
  const { pref, locale } = useAccountDateFormat();
  const mask = useMemo(() => dateFieldMask(locale, pref.dateStyle), [locale, pref.dateStyle]);

  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState(() => formatDateField(value, mask));
  const [isTextInvalid, setIsTextInvalid] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Re-sync the visible text from the canonical value (external set, calendar
  // pick, or a format change), but never while the parent is mid-edit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isFocused) setText(formatDateField(value, mask));
  }, [value, mask, isFocused]);

  function commit(raw: string, shouldReformat: boolean): void {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setIsTextInvalid(false);
      onChange("");
      return;
    }
    const iso = parseDateField(trimmed, mask);
    if (iso) {
      setIsTextInvalid(false);
      onChange(iso);
      if (shouldReformat) setText(formatDateField(iso, mask));
    } else if (shouldReformat) {
      // Keep the bad text visible (flagged) so the parent can fix it.
      setIsTextInvalid(true);
    }
  }

  return (
    <View className={cn("relative w-full", className)}>
      <Input
        value={text}
        placeholder={dateFieldPlaceholder(mask)}
        keyboardType="numbers-and-punctuation"
        autoComplete="off"
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
        isInvalid={isInvalid || isTextInvalid}
        className="pr-10"
        onFocus={() => setIsFocused(true)}
        onChangeText={(next) => {
          setText(next);
          commit(next, false); // keep the canonical value live
        }}
        onBlur={() => {
          setIsFocused(false);
          commit(text, true);
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("openCalendar")}
        hitSlop={4}
        onPress={() => setIsPickerOpen(true)}
        className="absolute inset-y-0 right-0 w-10 items-center justify-center"
      >
        <Icon name="calendar" size={18} color="faint" />
      </Pressable>
      <NativeDatePicker
        isOpen={isPickerOpen}
        value={value}
        min={min}
        max={max}
        locale={locale}
        title={accessibilityLabel}
        doneLabel={t("done")}
        onPick={(picked) => {
          setIsTextInvalid(false);
          onChange(picked);
        }}
        onClose={() => setIsPickerOpen(false)}
      />
    </View>
  );
}
