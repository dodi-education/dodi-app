import { TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  ASSET_PUBLICATION_DESCRIPTION_MAX_LENGTH,
  ASSET_PUBLICATION_NAME_MAX_LENGTH,
} from "@dodi/client-state/character-asset-publication";
import type { PublicationHandleError } from "@dodi/protocol/publication-handle";
import { dialogField, textarea } from "@dodi/ui-recipes";

import { PublishHandleField } from "@/components/games-library/publish-form-fields";
import { Input, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

const AREA_CLASS = cn(textarea.box, textarea.text);

/**
 * The share dialog's form: the name and description shown on Discover, and,
 * on a first publication, the account's public handle. Web:
 * components/parent/character-asset-share-fields.
 */
export function CharacterAssetShareFields({
  name,
  description,
  handle,
  isHandleNeeded,
  handleProblem,
  disabled,
  onNameChange,
  onDescriptionChange,
  onHandleChange,
}: {
  name: string;
  description: string;
  handle: string;
  isHandleNeeded: boolean;
  handleProblem: PublicationHandleError | null;
  disabled: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHandleChange: (value: string) => void;
}) {
  const t = useTranslations("characterAssets");
  return (
    <>
      <View className={dialogField.box}>
        <Text className={dialogField.label}>{t("shareNameLabel")}</Text>
        <Input
          value={name}
          maxLength={ASSET_PUBLICATION_NAME_MAX_LENGTH}
          editable={!disabled}
          accessibilityLabel={t("shareNameLabel")}
          onChangeText={onNameChange}
        />
      </View>
      <View className={dialogField.box}>
        <Text className={dialogField.label}>{t("shareDescriptionLabel")}</Text>
        <TextInput
          value={description}
          placeholder={t("shareDescriptionPlaceholder")}
          placeholderTextColor={textarea.placeholderColor}
          maxLength={ASSET_PUBLICATION_DESCRIPTION_MAX_LENGTH}
          editable={!disabled}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t("shareDescriptionLabel")}
          className={cn(AREA_CLASS, disabled && "opacity-50")}
          style={{ fontFamily: fontFamilyFor(AREA_CLASS) }}
          onChangeText={onDescriptionChange}
        />
      </View>
      {isHandleNeeded ? <PublishHandleField handle={handle} onChange={onHandleChange} problem={handleProblem} /> : null}
    </>
  );
}
