import { Pressable, View } from "react-native";

import { cn } from "@/lib/cn";

import { IconCheck } from "./icons";
import { Text } from "./text";

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/**
 * A labelled single-choice list (the native stand-in for the web's <select>):
 * one 48pt row per option, the chosen one checked.
 */
export function ChoiceList<T extends string>({
  label,
  hint,
  choices,
  value,
  onChange,
  disabled,
  isLabelHidden = false,
}: {
  /** The group's name (also read to screen readers). */
  label: string;
  hint?: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** The label sits elsewhere on screen (e.g. on a search field above). */
  isLabelHidden?: boolean;
}) {
  return (
    <View className="gap-1.5" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {isLabelHidden ? null : <Text variant="label">{label}</Text>}
      <View className="overflow-hidden rounded-xl border border-input bg-card">
        {choices.map((choice, index) => {
          const isSelected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled }}
              accessibilityLabel={choice.label}
              disabled={disabled}
              onPress={() => onChange(choice.value)}
              className={cn(
                "min-h-12 flex-row items-center gap-3 px-3",
                index > 0 && "border-t border-border",
                isSelected && "bg-primary-soft",
              )}
            >
              <Text className={cn("flex-1", isSelected && "font-semibold text-primary")}>
                {choice.label}
              </Text>
              {isSelected ? <IconCheck size={18} color="#2F6BD8" /> : null}
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text variant="muted">{hint}</Text> : null}
    </View>
  );
}
