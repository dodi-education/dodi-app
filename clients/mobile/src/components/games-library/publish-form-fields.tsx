import { View } from "react-native";
import { useTranslations } from "use-intl";
import { isValidAgeRange } from "@dodi/studio/age-range";
import {
  PUBLICATION_HANDLE_MAX_LENGTH,
  type PublicationHandleError,
} from "@dodi/protocol/publication-handle";
import { dialogField } from "@dodi/ui-recipes";

import { Input, Text } from "@/components/ui";

import { AgeRange } from "./age-range";

/** Publish form: the recommended age, a last chance to get it right (web: publish-dialog). */
export function PublishAgeField({
  ageMin,
  ageMax,
  onMinChange,
  onMaxChange,
  disabled,
}: {
  ageMin: number;
  ageMax: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  disabled: boolean;
}) {
  const t = useTranslations("gameStudio");
  return (
    <View className={dialogField.box}>
      <Text className={dialogField.label}>{t("recommendedAge")}</Text>
      <AgeRange
        min={ageMin}
        max={ageMax}
        onMinChange={onMinChange}
        onMaxChange={onMaxChange}
        minLabel={t("ageMinLabel")}
        maxLabel={t("ageMaxLabel")}
        disabled={disabled}
      />
      <Text className={dialogField.hint}>
        {isValidAgeRange(ageMin, ageMax) ? (
          t("publishRecommendedAgeHint")
        ) : (
          <Text className="text-danger">{t("ageRangeInvalid")}</Text>
        )}
      </Text>
    </View>
  );
}

/** Publish form, first publish only: the account's public handle. */
export function PublishHandleField({
  handle,
  onChange,
  problem,
}: {
  handle: string;
  onChange: (value: string) => void;
  problem: PublicationHandleError | null;
}) {
  const t = useTranslations("gameStudio");
  return (
    <View className={dialogField.box}>
      <Text className={dialogField.label}>{t("publishHandleLabel")}</Text>
      <Input
        value={handle}
        placeholder={t("publishHandlePlaceholder")}
        // Stop at the limit rather than letting someone type a name they
        // can't have; the regex still guards paste and the API.
        maxLength={PUBLICATION_HANDLE_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t("publishHandleLabel")}
        isInvalid={problem !== null}
        onChangeText={onChange}
      />
      <Text className={dialogField.hint}>
        {problem === "reserved"
          ? t("publishHandleReserved")
          : problem === "format"
            ? t("publishHandleFormat")
            : t("publishHandleHint")}
      </Text>
    </View>
  );
}
