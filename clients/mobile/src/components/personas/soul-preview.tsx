import { ScrollView } from "react-native";
import { soulPreview } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A read-only soul document (web: the personas pages' `<pre>`), scrolling inside its box. */
export function SoulPreview({ soul, size }: { soul: string; size: "tall" | "short" }) {
  return (
    <ScrollView className={cn(soulPreview.box, soulPreview[size])} nestedScrollEnabled>
      <Text className={soulPreview.text} selectable>
        {soul}
      </Text>
    </ScrollView>
  );
}
