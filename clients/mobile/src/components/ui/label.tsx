import type { ReactNode } from "react";
import { label } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Text } from "./text";

/** The web's Label (text-sm, medium). */
export function Label({ className, children }: { className?: string; children: ReactNode }) {
  return <Text className={cn(label.text, className)}>{children}</Text>;
}
