import { View } from "react-native";
import { useTranslations } from "use-intl";
import { kidRequiredCard } from "@dodi/ui-recipes";

import { BrowseContext } from "@/components/kid/browse-context";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { SnapshotLibrary } from "@/components/snapshots/snapshot-library";
import { cn } from "@/lib/cn";
import { useActiveKid } from "@/lib/use-active-kid";

/** The kid's snapshots tab (web: app/(kid)/snapshots/page). Scrolls inside the kid chrome. */
export default function KidSnapshotsScreen() {
  const t = useTranslations("snapshots");
  const { activeKidId } = useActiveKid();

  if (!activeKidId) {
    return (
      <View className={kidRequiredCard.box} style={kidShadowStyle("row")}>
        <KidText className={cn(kidRequiredCard.title, kidRequiredCard.textAlign)} accessibilityRole="header">
          {t("title")}
        </KidText>
        <KidText className={cn(kidRequiredCard.text, kidRequiredCard.textAlign)}>{t("kidRequired")}</KidText>
      </View>
    );
  }

  return (
    <BrowseContext kidId={activeKidId}>
      <SnapshotLibrary kidId={activeKidId} />
    </BrowseContext>
  );
}
