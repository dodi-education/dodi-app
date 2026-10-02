import type { ReactNode } from "react";
import { useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import { composer as styles } from "@dodi/ui-recipes";

import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

/** The input's height (the web's default composer height on a phone). */
const COMPOSER_HEIGHT = 150;
/** One line: an open plan surface shrinks the input so the canvas gets the screen. */
const COMPOSER_ONE_LINE = 28;
/** How far it grows back on a plan surface once there is text to read. */
const COMPOSER_SURFACE_MAX = 96;

interface ComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  placeholder: string;
  isLocked: boolean;
  isThinking: boolean;
  /** A plan surface covers the thread: one line, no footer. */
  isSurfaceOpen: boolean;
  pendingImages: string[];
  onRemoveImage: (index: number) => void;
  isAttachDisabled: boolean;
  onAttach: () => void;
  onSend: () => void;
  onStop: () => void;
  /** Warnings, the running hint, resume and errors, above the card. */
  notices: ReactNode;
}

/** The message box (web: the studio composer): staged images, input, attach and send. */
export function Composer({
  draft,
  onDraftChange,
  placeholder,
  isLocked,
  isThinking,
  isSurfaceOpen,
  pendingImages,
  onRemoveImage,
  isAttachDisabled,
  onAttach,
  onSend,
  onStop,
  notices,
}: ComposerProps) {
  const t = useTranslations("gameStudio");
  const [isFocused, setIsFocused] = useState(false);
  const hasText = draft.trim().length > 0;
  const height = !isSurfaceOpen
    ? COMPOSER_HEIGHT
    : hasText
      ? Math.min(COMPOSER_HEIGHT, COMPOSER_SURFACE_MAX)
      : COMPOSER_ONE_LINE;
  const isSendOn = isThinking ? true : hasText && !isLocked;
  const inputClasses = cn(styles.input, styles.inputText);

  return (
    <View className={styles.box}>
      {notices}
      <View
        className={cn(styles.card, isFocused && styles.cardFocused)}
        style={{
          shadowColor: COLORS.ink,
          shadowOpacity: 0.07,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        {pendingImages.length > 0 ? (
          <View className={styles.pending}>
            {pendingImages.map((img, i) => (
              <View key={i} className="relative">
                <Image source={{ uri: img }} className={styles.pendingImage} resizeMode="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("removeImage")}
                  onPress={() => onRemoveImage(i)}
                  hitSlop={12}
                  className={styles.remove}
                >
                  <Icon name="close" size={11} stroke={3} color="primary-foreground" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <TextInput
          multiline
          editable={!isLocked}
          value={draft}
          onChangeText={onDraftChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.faint}
          accessibilityLabel={placeholder}
          textAlignVertical="top"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={inputClasses}
          style={{ height, fontFamily: fontFamilyFor(inputClasses) }}
        />
        <View className={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isAttachDisabled && pendingImages.length > 0 ? t("attachLimitReached") : t("attachImage")}
            accessibilityState={{ disabled: isAttachDisabled }}
            onPress={onAttach}
            disabled={isAttachDisabled}
            hitSlop={4}
            className={cn(styles.attach, isAttachDisabled && styles.attachDisabled, "active:bg-primary-soft")}
          >
            <Icon name="photo" size={18} color="muted-foreground" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isThinking ? t("stop") : t("send")}
            accessibilityState={{ disabled: isLocked || !isSendOn }}
            onPress={isThinking ? onStop : onSend}
            disabled={isLocked || (isThinking ? false : !hasText)}
            hitSlop={4}
            className={cn(styles.send, isSendOn ? styles.sendOn : styles.sendOff, "active:scale-95")}
          >
            <Icon name={isThinking ? "stop" : "send"} size={17} color="primary-foreground" />
          </Pressable>
        </View>
      </View>
      {!isSurfaceOpen ? <Text className={styles.footer}>{t("footer")}</Text> : null}
    </View>
  );
}
