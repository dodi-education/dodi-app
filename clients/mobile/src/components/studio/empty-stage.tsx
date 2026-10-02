import { View } from "react-native";
import { emptyStage } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** The stage with nothing to show yet (no preview, no code). */
export function EmptyStage({ title, icon = "games" }: { title: string; icon?: "games" | "code" }) {
  return (
    <View className={emptyStage.box}>
      <View className={emptyStage.iconBox}>
        <Icon name={icon} size={emptyStage.icon.size} color="faint" />
      </View>
      <Text className={cn(emptyStage.text, emptyStage.title)}>{title}</Text>
    </View>
  );
}
