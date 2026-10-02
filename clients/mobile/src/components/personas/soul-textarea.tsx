import { useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { COLORS } from "@dodi/design-tokens";
import { soulTextarea } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

/** The soul document editor (web: the personas pages' mono `<textarea>`, min 320px). */
export function SoulTextarea({
  isInvalid,
  onFocus,
  onBlur,
  style,
  ...props
}: Omit<TextInputProps, "multiline"> & { isInvalid?: boolean }) {
  const [isFocused, setIsFocused] = useState(false);
  const classes = cn(
    soulTextarea.box,
    soulTextarea.text,
    isFocused && soulTextarea.focused,
    isInvalid && soulTextarea.invalid,
  );
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor={COLORS["muted-foreground"]}
      className={classes}
      style={[{ fontFamily: fontFamilyFor(classes) }, style]}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
