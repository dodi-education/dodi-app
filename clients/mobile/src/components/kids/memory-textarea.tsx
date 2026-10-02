import { useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { input, memoryTextarea } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

/**
 * The memory page's notes and dossier editor (web: its mono `<textarea>`),
 * `rows` lines tall like the web's rows attribute.
 */
export function MemoryTextarea({
  rows,
  onFocus,
  onBlur,
  style,
  ...props
}: Omit<TextInputProps, "multiline"> & { rows: number }) {
  const [isFocused, setIsFocused] = useState(false);
  const classes = cn(memoryTextarea.box, memoryTextarea.text, isFocused && memoryTextarea.focused);
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor={input.placeholderColor}
      className={classes}
      // 12.5px text, relaxed leading (1.625) ≈ 20pt a line, plus py-2.
      style={[{ fontFamily: fontFamilyFor(classes), minHeight: rows * 20 + 16 }, style]}
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
