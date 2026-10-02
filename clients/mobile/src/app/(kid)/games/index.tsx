import { View } from "react-native";
import { useTranslations } from "use-intl";
import { kidRequiredCard } from "@dodi/ui-recipes";

import { BrowseContext } from "@/components/kid/browse-context";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { GameLibrary } from "@/components/kid-games/game-library";
import { cn } from "@/lib/cn";
import { useActiveKid } from "@/lib/use-active-kid";

/** The kid's games tab (web: app/(kid)/games/page). Scrolls inside the kid chrome. */
export default function KidGamesScreen() {
  const t = useTranslations("games");
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
      <GameLibrary kidId={activeKidId} />
    </BrowseContext>
  );
}
