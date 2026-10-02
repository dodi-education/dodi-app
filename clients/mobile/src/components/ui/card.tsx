import type { ReactNode } from "react";
import { View } from "react-native";
import { card } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Text } from "./text";

type Props = { className?: string; children?: ReactNode };

/** The web's Card and its parts. */
export function Card({ className, children }: Props) {
  return <View className={cn(card.root, className)}>{children}</View>;
}

export function CardHeader({ className, children }: Props) {
  return <View className={cn(card.header, className)}>{children}</View>;
}

export function CardTitle({ className, children }: Props) {
  return <Text className={cn(card.title, className)}>{children}</Text>;
}

export function CardDescription({ className, children }: Props) {
  return <Text className={cn(card.description, className)}>{children}</Text>;
}

export function CardContent({ className, children }: Props) {
  return <View className={cn(card.content, className)}>{children}</View>;
}

export function CardFooter({ className, children }: Props) {
  return <View className={cn(card.footer, className)}>{children}</View>;
}
