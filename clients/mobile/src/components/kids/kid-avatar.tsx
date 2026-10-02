import { View } from "react-native";
import { kidAvatar, kidAvatarColor } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A kid's initial circle in its list-position color (web: the kids list avatar). */
export function KidAvatar({ initial, colorIndex }: { initial: string; colorIndex: number }) {
  const color = kidAvatarColor(colorIndex);
  return (
    <View className={cn(kidAvatar.box, color.bg)}>
      <Text className={cn(kidAvatar.text, color.fg)}>{initial}</Text>
    </View>
  );
}
