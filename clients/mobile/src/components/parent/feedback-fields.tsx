import { TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
  type FeedbackCategory,
  type FeedbackDraft,
} from "@dodi/client-state/feedback";
import { dialogField, textarea } from "@dodi/ui-recipes";

import { Input, Select, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

const AREA_CLASS = cn(textarea.box, textarea.text);

/**
 * The feedback dialog's form: the sender's name, the category and the
 * message, with the note that it reaches the team in readable form. Web:
 * components/parent/feedback-fields.
 */
export function FeedbackFields({
  draft,
  disabled,
  onChange,
}: {
  draft: FeedbackDraft;
  disabled: boolean;
  onChange: (patch: Partial<FeedbackDraft>) => void;
}) {
  const t = useTranslations("feedback");
  return (
    <>
      <View className={dialogField.box}>
        <Text className={dialogField.label}>{t("nameLabel")}</Text>
        <Input
          value={draft.senderName}
          autoComplete="name"
          textContentType="name"
          maxLength={FEEDBACK_SENDER_NAME_MAX_LENGTH}
          editable={!disabled}
          accessibilityLabel={t("nameLabel")}
          onChangeText={(senderName) => onChange({ senderName })}
        />
      </View>
      <View className={dialogField.box}>
        <Text className={dialogField.label}>{t("categoryLabel")}</Text>
        <Select<FeedbackCategory>
          label={t("categoryLabel")}
          value={draft.category || null}
          placeholder={t("categoryPlaceholder")}
          disabled={disabled}
          options={FEEDBACK_CATEGORIES.map((category) => ({
            value: category,
            label: t(`categories.${category}`),
          }))}
          onValueChange={(category) => onChange({ category })}
        />
        {draft.gameId ? <Text className={dialogField.hint}>{t("gameAttached")}</Text> : null}
      </View>
      <View className={dialogField.box}>
        <Text className={dialogField.label}>{t("messageLabel")}</Text>
        <TextInput
          value={draft.message}
          placeholder={t("messagePlaceholder")}
          placeholderTextColor={textarea.placeholderColor}
          maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
          editable={!disabled}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t("messageLabel")}
          className={cn(AREA_CLASS, disabled && "opacity-50")}
          style={{ fontFamily: fontFamilyFor(AREA_CLASS) }}
          onChangeText={(message) => onChange({ message })}
        />
        <Text className={dialogField.hint}>{t("privacyHint")}</Text>
      </View>
    </>
  );
}
