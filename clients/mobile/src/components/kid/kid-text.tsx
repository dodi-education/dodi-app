import { Text, type TextProps } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Text in the kid view: Nunito (`font-kid`). The web sets the face once on the
 * kid root; React Native doesn't inherit fonts, so every kid label uses this.
 */
export function KidText({ className, ...props }: TextProps) {
  return <Text className={cn("font-kid", className)} {...props} />;
}
