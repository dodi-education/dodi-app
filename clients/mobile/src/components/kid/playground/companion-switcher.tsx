import { View } from "react-native";
import { useTranslations } from "use-intl";
import { companionNameOf, setActiveCompanion } from "@dodi/client-state/companions";
import { playground as p } from "@dodi/ui-recipes";

import { KidText } from "@/components/kid/kid-text";
import { companionFlowDeps } from "@/lib/companion-flow-deps";
import { useActiveCompanion } from "@/lib/use-active-companion";

import { PlaygroundChip } from "./chip";

/** The kid's companions, to switch between (web: kid/playground/companion-switcher; shown with more than one). */
export function CompanionSwitcher() {
  const t = useTranslations("playground");
  const { kid, companion } = useActiveCompanion();
  if (!kid || kid.companions.length < 2) return null;
  return (
    <View className={p.section} accessibilityRole="radiogroup" accessibilityLabel={t("switchCompanion")}>
      <KidText className={p.label}>{t("switchCompanion")}</KidText>
      <View className={p.row}>
        {kid.companions.map((c) => {
          const isActive = c.id === companion?.id;
          return (
            <PlaygroundChip
              key={c.id}
              accessibilityRole="radio"
              isSelected={isActive}
              onPress={() => {
                if (!isActive) void setActiveCompanion(companionFlowDeps(), kid.id, c.id).catch(() => {});
              }}
            >
              {companionNameOf(c)}
            </PlaygroundChip>
          );
        })}
      </View>
    </View>
  );
}
