import { type Href, useRouter } from "expo-router";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui";

/**
 * Trailing quick-actions for a kid row: Edit + Memory (web:
 * parent/kid-row-actions), 32pt ghost icon buttons beside the row's link.
 */
export function KidRowActions({ kidId }: { kidId: string }) {
  const t = useTranslations("kids");
  const router = useRouter();
  return (
    <View className="shrink-0 flex-row items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        icon="edit"
        iconColor="muted-foreground"
        accessibilityRole="link"
        accessibilityLabel={t("editTitle")}
        hitSlop={6}
        onPress={() => router.push(`/parent/kids/${kidId}` as Href)}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        icon="memory"
        iconColor="muted-foreground"
        accessibilityRole="link"
        accessibilityLabel={t("viewMemory")}
        hitSlop={6}
        onPress={() => router.push(`/parent/kids/${kidId}/memory` as Href)}
      />
    </View>
  );
}
