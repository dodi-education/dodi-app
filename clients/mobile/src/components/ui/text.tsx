import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

export interface TextProps extends RNTextProps {
  className?: string;
}

/**
 * All text in the app. Defaults match the web body (16px, foreground color);
 * the weight class picks the Hanken Grotesk (or Nunito, `font-kid`) face.
 */
export function Text({ className, style, ...props }: TextProps) {
  const classes = cn("text-base text-foreground", className);
  return (
    <RNText
      className={classes}
      style={[style, { fontFamily: fontFamilyFor(classes), fontWeight: "normal" }]}
      {...props}
    />
  );
}
