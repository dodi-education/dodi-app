import { Text as RNText, type TextProps } from "react-native";

import { cn } from "@/lib/cn";

const VARIANTS = {
  title: "text-2xl font-bold text-ink",
  heading: "text-lg font-semibold text-ink",
  body: "text-base text-ink",
  muted: "text-sm text-muted-foreground",
  label: "text-sm font-medium text-ink-2",
  error: "text-sm text-danger",
} as const;

export interface AppTextProps extends TextProps {
  variant?: keyof typeof VARIANTS;
  className?: string;
}

export function Text({ variant = "body", className, ...props }: AppTextProps) {
  return <RNText className={cn(VARIANTS[variant], className)} {...props} />;
}
