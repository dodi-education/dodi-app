import { View } from "react-native";
import { useTranslations } from "use-intl";
import type { PublicationRejectionReason } from "@dodi/protocol/publication-review";
import { rejectionReason } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** The review's findings, one card per reason with the agent's note (web: publish-rejection-reasons). */
export function PublishRejectionReasons({
  reasons,
  isPermanent,
}: {
  reasons: PublicationRejectionReason[];
  /** Hard rejections read as final (danger), soft ones as fixable (warning). */
  isPermanent: boolean;
}) {
  const t = useTranslations("gameStudio");
  if (reasons.length === 0) return null;

  return (
    <View className={rejectionReason.list}>
      {reasons.map((reason, i) => (
        <View
          key={`${reason.code}-${i}`}
          className={cn(rejectionReason.box, isPermanent ? rejectionReason.permanent : rejectionReason.fixable)}
        >
          <Text
            className={cn(
              rejectionReason.text,
              rejectionReason.title,
              isPermanent ? rejectionReason.titlePermanent : rejectionReason.titleFixable,
            )}
          >
            {t(`publishReason_${reason.code}`)}
          </Text>
          {reason.note ? (
            <Text className={cn(rejectionReason.text, rejectionReason.note)}>{reason.note}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
