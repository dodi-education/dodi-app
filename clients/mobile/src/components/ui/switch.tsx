import { useEffect, useState } from "react";
import { Animated, Pressable } from "react-native";
import { switchControl } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

/** The web's 36×20 switch (not the OS toggle): primary when on. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  accessibilityLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const [offset] = useState(() => new Animated.Value(checked ? 1 : 0));
  useEffect(() => {
    Animated.timing(offset, { toValue: checked ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [checked, offset]);
  const { off, on } = switchControl.thumbOffset;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      hitSlop={12}
      onPress={() => onCheckedChange(!checked)}
      className={cn(switchControl.track, "justify-center", checked ? switchControl.trackOn : switchControl.trackOff, disabled && "opacity-50")}
    >
      <Animated.View
        className={switchControl.thumb}
        style={{
          transform: [{ translateX: offset.interpolate({ inputRange: [0, 1], outputRange: [off, on] }) }],
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 1,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
      />
    </Pressable>
  );
}
