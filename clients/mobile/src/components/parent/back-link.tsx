import { type Href, Link } from "expo-router";
import { Pressable } from "react-native";
import { backLink } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";

/** The web's "← Back" link above a page's sub-navigation. */
export function BackLink({ href, children }: { href: Href; children: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" className={backLink.box} hitSlop={8}>
        <Icon name="arrow_left" size={backLink.icon.size} stroke={backLink.icon.stroke} color="muted-foreground" />
        <Text className={backLink.text}>{children}</Text>
      </Pressable>
    </Link>
  );
}
