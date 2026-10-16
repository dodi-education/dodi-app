import { Image, Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SENDER_NAME_MAX_LENGTH,
  type FeedbackCategory,
  type FeedbackDraft,
} from "@dodi/client-state/feedback";
import { dialogField, dialogImage, textarea } from "@dodi/ui-recipes";

import { Button, Icon, Input, Select, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

const AREA_CLASS = cn(textarea.box, textarea.text);

/**
 * The feedback dialog's form: the sender's name, the category, the message
 * and an optional image from the photo library, with the note that it all
 * reaches the team in readable form. Web: components/parent/feedback-fields.
 */
export function FeedbackFields({
  draft,
  disabled,
  isPreparingImage,
  onChange,
  onPickImage,
}: {
  draft: FeedbackDraft;
  disabled: boolean;
  isPreparingImage: boolean;
  onChange: (patch: Partial<FeedbackDraft>) => void;
  /** Picks and prepares an image, then puts it into the draft (feedback-dialog). */
  onPickImage: () => void;
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
      </View>
      <View className={dialogField.box}>
        <Text className={dialogField.label}>{t("imageLabel")}</Text>
        {draft.image ? (
          <View className={dialogImage.box}>
            <Image
              source={{ uri: draft.image }}
              accessible
              accessibilityLabel={t("imageAlt")}
              resizeMode="cover"
              className={dialogImage.image}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("removeImage")}
              disabled={disabled}
              hitSlop={10}
              onPress={() => onChange({ image: null })}
              className={cn(dialogImage.remove, "active:bg-danger")}
            >
              <Icon name="close" size={12} stroke={3} color="primary-foreground" />
            </Pressable>
          </View>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon="photo"
            className="self-start"
            isLoading={isPreparingImage}
            disabled={disabled || isPreparingImage}
            onPress={onPickImage}
          >
            {isPreparingImage ? t("imagePreparing") : t("attachImage")}
          </Button>
        )}
        <Text className={dialogField.hint}>{t("imageHint")}</Text>
      </View>
      <Text className={dialogField.hint}>{t("privacyHint")}</Text>
    </>
  );
}
