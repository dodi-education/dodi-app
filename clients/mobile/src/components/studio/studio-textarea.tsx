import { useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { COLORS } from "@dodi/design-tokens";
import { studioTextarea } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

interface StudioTextareaProps extends Omit<TextInputProps, "multiline"> {
  /** Red border (web: aria-invalid). */
  isInvalid?: boolean;
  /** Extra recipe classes: the field's min height, a warning border. */
  className?: string;
}

/** The settings form's multi-line field (web: the studio's styled <textarea>). */
export function StudioTextarea({ isInvalid, className, onFocus, onBlur, style, ...props }: StudioTextareaProps) {
  const [isFocused, setIsFocused] = useState(false);
  const classes = cn(
    studioTextarea.box,
    studioTextarea.text,
    className,
    isFocused && studioTextarea.focused,
    isInvalid && studioTextarea.invalid,
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
