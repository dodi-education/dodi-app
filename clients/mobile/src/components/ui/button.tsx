import { ActivityIndicator, Pressable, type PressableProps } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "./text";

const VARIANTS = {
  primary: { box: "bg-primary", text: "text-primary-foreground", spinner: "#FFFFFF" },
  secondary: { box: "bg-primary-soft", text: "text-primary-hover", spinner: "#2659BC" },
  ghost: { box: "bg-transparent", text: "text-primary", spinner: "#2F6BD8" },
  danger: { box: "bg-danger", text: "text-white", spinner: "#FFFFFF" },
} as const;

export interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: keyof typeof VARIANTS;
  isLoading?: boolean;
  className?: string;
}

/** A 48pt-tall button (touch targets stay above the 44pt minimum). */
export function Button({
  label,
  variant = "primary",
  isLoading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const style = VARIANTS[variant];
  const isDisabled = disabled || isLoading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      disabled={isDisabled}
      className={cn(
        "min-h-12 flex-row items-center justify-center rounded-xl px-5",
        style.box,
        isDisabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={style.spinner} />
      ) : (
        <Text className={cn("text-base font-semibold", style.text)}>{label}</Text>
      )}
    </Pressable>
  );
}
