import type { ReactNode } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";
import type { DiscoverGameDetail } from "@dodi/types/games";
import { gamePreview as g } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useTagLabel } from "@/lib/tag-label";

import { tagStyle } from "./tag-style";

/** The Infos tab: the studio's settings reduced to read-only text (web: game-preview). */
export function PreviewInfos({ detail }: { detail: DiscoverGameDetail }) {
  const t = useTranslations("gameStudio");
  return (
    <View className={g.infos}>
      <InfoRow label={t("learningGoal")}>
        {detail.learning_goal ? (
          <Text className={cn(g.infoText, g.infoLongText)}>{detail.learning_goal}</Text>
        ) : (
          <EmptyValue />
        )}
      </InfoRow>

      <InfoRow label={t("tags")}>
        {detail.tags.length > 0 ? (
          <View className={g.tags}>
            {detail.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </View>
        ) : (
          <EmptyValue />
        )}
      </InfoRow>

      <InfoRow label={t("recommendedAge")}>
        <Text className={g.infoText}>
          {detail.target_age_min}–{detail.target_age_max}
        </Text>
      </InfoRow>
    </View>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className={g.infoRow}>
      <Text className={g.infoLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** One read-only tag pill (visual twin of the list's tag tile). */
function TagChip({ tag }: { tag: string }) {
  const tagLabel = useTagLabel();
  const s = tagStyle(tag);
  return (
    <View className={g.tagChip} style={{ backgroundColor: s.bg }}>
      <Icon name={s.icon} size={13} tint={s.fg} />
      <Text className={g.tagChipText} style={{ color: s.fg }}>
        {tagLabel(tag)}
      </Text>
    </View>
  );
}

function EmptyValue() {
  return <Text className={g.infoEmpty}>—</Text>;
}
