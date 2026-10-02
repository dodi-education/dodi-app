import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, TextInput, View } from "react-native";
import { pinCell } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Text } from "./text";

/**
 * The web's PinInput: one cell per digit (48×56), dots for entered digits,
 * shakes on error. A single hidden field takes the keyboard input.
 */
export function PinInput({
  length = 4,
  value,
  onChange,
  onComplete,
  isError = false,
  autoFocus,
  disabled = false,
  accessibilityLabel,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  isError?: boolean;
  autoFocus?: boolean;
  /** While verifying (web: disabled + opacity-50). */
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!isError) return;
    Animated.sequence(
      [-9, 9, -9, 9, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 80, useNativeDriver: true }),
      ),
    ).start();
  }, [isError, shake]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => inputRef.current?.focus()}
      className={disabled ? "opacity-50" : undefined}
    >
      <Animated.View className={pinCell.row} style={{ transform: [{ translateX: shake }] }}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            className={cn(
              pinCell.box,
              // Six cells don't fit a narrow card at the web's fixed 48pt: let
              // them share the row, never wider than 48pt.
              "max-w-12 flex-1 items-center justify-center",
              isFocused && i === Math.min(value.length, length - 1) && pinCell.focused,
              isError && pinCell.invalid,
            )}
          >
            <Text className={pinCell.text}>{value[i] ? "•" : ""}</Text>
          </View>
        ))}
      </Animated.View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => {
          const digits = next.replace(/\D/g, "").slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoFocus={autoFocus}
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={length}
        secureTextEntry
        accessibilityLabel={accessibilityLabel}
        className="absolute h-px w-px opacity-0"
      />
    </Pressable>
  );
}
