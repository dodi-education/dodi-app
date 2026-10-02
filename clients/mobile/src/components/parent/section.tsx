import { Children, isValidElement, type ReactNode } from "react";
import { View } from "react-native";
import { pageActions, section } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

import { RequiredMark } from "./rows";

/** Right-aligned toolbar for a page's primary action(s), above the first Section. */
export function PageActions({ children }: { children: ReactNode }) {
  return <View className={cn(pageActions, "mb-5")}>{children}</View>;
}

/**
 * The web's flat Section: heading OUTSIDE the card, the card holds hairline-
 * divided rows.
 */
export function Section({
  title,
  desc,
  action,
  required,
  className,
  children,
}: {
  title?: string;
  desc?: string;
  action?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn(section.root, className)}>
      {title ? (
        <View className={section.head}>
          <View className="min-w-0 flex-1">
            <Text className={section.title} accessibilityRole="header">
              {title}
              {required ? <RequiredMark /> : null}
            </Text>
            {desc ? <Text className={section.description}>{desc}</Text> : null}
          </View>
          {action ?? null}
        </View>
      ) : null}
      <View className={section.card}>
        {rows.map((child, i) => (
          <View key={child.key ?? i} className={i > 0 ? section.divider : undefined}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}
