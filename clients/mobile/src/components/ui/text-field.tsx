import { useState } from "react";
import { Pressable, TextInput, type TextInputProps, View } from "react-native";
import { IconEye, IconEyeOff } from "./icons";

import { cn } from "@/lib/cn";

import { Text } from "./text";

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  /** Hide the value with a show / hide toggle (labels for screen readers). */
  secure?: { showLabel: string; hideLabel: string };
}

export function TextField({ label, error, hint, secure, className, ...props }: TextFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  return (
    <View className="gap-1.5">
      <Text variant="label">{label}</Text>
      <View
        className={cn(
          "min-h-12 flex-row items-center rounded-xl border bg-card px-3",
          error ? "border-danger" : "border-input",
        )}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor="#93A5B8"
          secureTextEntry={secure ? !isRevealed : undefined}
          autoCapitalize={secure ? "none" : props.autoCapitalize}
          className={cn("flex-1 py-3 text-base text-ink", className)}
          {...props}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? secure.hideLabel : secure.showLabel}
            onPress={() => setIsRevealed((v) => !v)}
            className="h-11 w-11 items-center justify-center"
          >
            {isRevealed ? <IconEyeOff size={20} color="#61758C" /> : <IconEye size={20} color="#61758C" />}
          </Pressable>
        )}
      </View>
      {hint && !error ? <Text variant="muted">{hint}</Text> : null}
      {error ? <Text variant="error">{error}</Text> : null}
    </View>
  );
}
