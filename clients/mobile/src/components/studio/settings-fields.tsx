import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import type { GamePerspective } from "@dodi/types/games";
import { optionChip, studioSettings } from "@dodi/ui-recipes";

import { RequiredMark } from "@/components/parent/rows";
import { Icon, Switch, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A labelled settings field: label (with the required mark), the control, a hint. */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className={studioSettings.field}>
      <View className={studioSettings.labelRow}>
        <Text className={studioSettings.label}>
          {label}
          {required ? <RequiredMark /> : null}
        </Text>
      </View>
      {children}
      {hint ? <Text className={studioSettings.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A switch with its label beside it; the label toggles it too (web: <label>). */
export function SwitchField({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <View className={studioSettings.switchRow}>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        accessibilityLabel={label}
      />
      <Text
        className={studioSettings.switchText}
        onPress={disabled ? undefined : () => onCheckedChange(!checked)}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </View>
  );
}

/** "Open settings": the AI provider settings, inline in a sentence. */
export function OpenSettingsLink({ className }: { className: string }) {
  const t = useTranslations("gameStudio");
  return (
    <Link href="/parent/settings/ai-providers" asChild>
      <Text accessibilityRole="link" className={className}>
        {t("openSettings")}
      </Text>
    </Link>
  );
}

const PERSPECTIVES: [GamePerspective | null, string][] = [
  [null, "perspectiveUnspecified"],
  ["bird", "perspectiveBird"],
  ["side", "perspectiveSide"],
  ["isometric", "perspectiveIsometric"],
];

/** The camera perspective the design should use (null = dodi chooses). */
export function PerspectivePicker({
  value,
  onChange,
}: {
  value: GamePerspective | null;
  onChange: (value: GamePerspective | null) => void;
}) {
  const t = useTranslations("gameStudio");
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t("perspectiveLabel")} className={studioSettings.chips}>
      {PERSPECTIVES.map(([option, key]) => {
        const isSelected = value === option;
        return (
          <Pressable
            key={option ?? "unspecified"}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            onPress={() => onChange(option)}
            hitSlop={4}
            className={cn(optionChip.box, isSelected ? optionChip.selected : optionChip.idle)}
          >
            <Text className={cn(optionChip.text, isSelected ? optionChip.selectedText : optionChip.idleText)}>
              {t(key)}
            </Text>
            {isSelected ? <Icon name="check" size={13} stroke={3} color="primary" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
