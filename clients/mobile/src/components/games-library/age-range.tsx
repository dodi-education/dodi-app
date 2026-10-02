import { View } from "react-native";
import { isValidAgeRange } from "@dodi/studio/age-range";
import { ageRange } from "@dodi/ui-recipes";

import { Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Digits typed → number; `NaN` while the field is cleared (web: valueAsNumber). */
function parseAge(text: string): number {
  const digits = text.replace(/[^0-9]/g, "");
  return digits === "" ? Number.NaN : Number(digits);
}

/** Two small number fields, "min – max", for a recommended age range (web: age-range). */
export function AgeRange({
  min,
  max,
  onMinChange,
  onMaxChange,
  minLabel,
  maxLabel,
  disabled,
}: {
  min: number;
  max: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  disabled?: boolean;
}) {
  const isInvalid = !isValidAgeRange(min, max);
  return (
    <View className={ageRange.row}>
      <Input
        keyboardType="number-pad"
        maxLength={2}
        value={Number.isFinite(min) ? String(min) : ""}
        accessibilityLabel={minLabel}
        isInvalid={isInvalid}
        editable={!disabled}
        onChangeText={(text) => onMinChange(parseAge(text))}
        className={cn(ageRange.field, isInvalid && ageRange.invalid)}
      />
      <Text className={ageRange.dash} accessibilityElementsHidden importantForAccessibility="no">
        –
      </Text>
      <Input
        keyboardType="number-pad"
        maxLength={2}
        value={Number.isFinite(max) ? String(max) : ""}
        accessibilityLabel={maxLabel}
        isInvalid={isInvalid}
        editable={!disabled}
        onChangeText={(text) => onMaxChange(parseAge(text))}
        className={cn(ageRange.field, isInvalid && ageRange.invalid)}
      />
    </View>
  );
}
