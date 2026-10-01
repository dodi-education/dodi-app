import { Switch, View } from "react-native";

import { Text } from "./text";

/** A labelled toggle row (the whole row is the accessible switch). */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <Text>{label}</Text>
        {description ? <Text variant="muted">{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: "#2F6BD8", false: "#D3DDE8" }}
      />
    </View>
  );
}
