import { forwardRef, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { input } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

export interface InputProps extends TextInputProps {
  className?: string;
  /** Red border (web: aria-invalid). */
  isInvalid?: boolean;
}

/** The web's Input: 36pt tall, 16px text on phones, primary border when focused. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, isInvalid, onFocus, onBlur, style, ...props },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);
  const classes = cn(
    input.box,
    input.text,
    isFocused && input.focused,
    isInvalid && input.invalid,
    className,
  );
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={input.placeholderColor}
      className={classes}
      style={[{ fontFamily: fontFamilyFor(classes), paddingVertical: 0 }, style]}
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
});
