import { useEffect, useState } from "react";
import { Animated, Pressable } from "react-native";
import { switchControl } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { isReduceMotionOn } from "@/lib/use-reduce-motion";

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
  /** Required: the visible label sits beside the switch, not in it. */
  accessibilityLabel: string;
}) {
  const [offset] = useState(() => new Animated.Value(checked ? 1 : 0));
  useEffect(() => {
    const toValue = checked ? 1 : 0;
    // Reduced motion: the thumb jumps (read per toggle, so a flip never replays it).
    if (isReduceMotionOn()) offset.setValue(toValue);
    else Animated.timing(offset, { toValue, duration: 150, useNativeDriver: true }).start();
  }, [checked, offset]);
  const { off, on } = switchControl.thumbOffset;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      // 36x20: a 44pt target (12 + 20 + 12, 4 + 36 + 4 and then some).
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
