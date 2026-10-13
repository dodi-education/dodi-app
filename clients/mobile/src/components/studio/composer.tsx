import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { type AccessibilityActionEvent, type GestureResponderEvent, Image, Pressable, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";
import { COLORS } from "@dodi/design-tokens";
import {
  COMPOSER_HEIGHT_BOUNDS,
  COMPOSER_HEIGHT_KEYS,
  COMPOSER_ONE_LINE,
  composerInputHeight,
  dragComposerHeight,
  readComposerHeight,
  stepComposerHeight,
} from "@dodi/studio/composer-height";
import { composer as styles } from "@dodi/ui-recipes";

import { mobilePlatform } from "@/adapters/platform";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/fonts";

/** The app is the web's vertical (phone) layout. */
const LAYOUT = "vertical";
const BOUNDS = COMPOSER_HEIGHT_BOUNDS[LAYOUT];
const HEIGHT_KEY = COMPOSER_HEIGHT_KEYS[LAYOUT];

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
  // The parent's chosen height (the grip drags it), remembered on the device.
  const [chosenHeight, setChosenHeight] = useState(() =>
    readComposerHeight(mobilePlatform.preferences.getItem(HEIGHT_KEY), LAYOUT),
  );
  const chosenRef = useRef(chosenHeight);
  // What the input got: less than chosen while the open keyboard leaves too little room.
  const laidOutRef = useRef(chosenHeight);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef({ startY: 0, startHeight: 0 });
  const onResizeStart = (e: GestureResponderEvent): void => {
    // Drag from what is on screen, not from a height the keyboard squeezed.
    dragRef.current = { startY: e.nativeEvent.pageY, startHeight: Math.min(chosenRef.current, laidOutRef.current) };
    setIsResizing(true);
  };
  const onResizeMove = (e: GestureResponderEvent): void => {
    const { startY, startHeight } = dragRef.current;
    chosenRef.current = dragComposerHeight(startHeight, e.nativeEvent.pageY - startY, LAYOUT);
    setChosenHeight(chosenRef.current);
  };
  const onResizeEnd = (): void => {
    setIsResizing(false);
    mobilePlatform.preferences.setItem(HEIGHT_KEY, String(chosenRef.current));
  };
  // Screen readers: swipe up / down on the grip.
  const onResizeAction = (e: AccessibilityActionEvent): void => {
    const direction = e.nativeEvent.actionName === "increment" ? "grow" : "shrink";
    chosenRef.current = stepComposerHeight(chosenRef.current, direction, LAYOUT);
    setChosenHeight(chosenRef.current);
    mobilePlatform.preferences.setItem(HEIGHT_KEY, String(chosenRef.current));
  };
  const hasText = draft.trim().length > 0;
  const height = composerInputHeight({ height: chosenHeight, isSurfaceOpen, hasText });
  const isSendOn = isThinking ? true : hasText && !isLocked;
  const inputClasses = cn(styles.input, styles.inputText);

  return (
    <View className={cn(styles.box, styles.boxShrink)}>
      {notices}
      <View
        className={cn(styles.card, styles.cardShrink, isFocused && styles.cardFocused)}
        style={{
          shadowColor: COLORS.ink,
          shadowOpacity: 0.07,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        {/* The resize grip on the card's top edge (not over a plan surface, which
            sizes the input itself). Before the staged images, so their remove
            buttons stay on top of it. */}
        {!isSurfaceOpen ? (
          <View
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={onResizeStart}
            onResponderMove={onResizeMove}
            onResponderRelease={onResizeEnd}
            onResponderTerminate={onResizeEnd}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={t("resizeComposer")}
            accessibilityValue={{ min: BOUNDS.min, max: BOUNDS.max, now: chosenHeight }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={onResizeAction}
            className={styles.resize}
          >
            <View className={cn(styles.grip, isResizing && styles.gripActive)} />
          </View>
        ) : null}
        {pendingImages.length > 0 ? (
          <View className={styles.pending}>
            {pendingImages.map((img, i) => (
              <View key={i} className="relative">
                <Image
                  source={{ uri: img }}
                  className={styles.pendingImage}
                  resizeMode="cover"
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t("attachedImage", { n: i + 1 })}
                />
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
          onLayout={(e) => {
            laidOutRef.current = e.nativeEvent.layout.height;
          }}
          className={inputClasses}
          // Shrinks (to a line at least) before the open keyboard clips the send row.
          style={{ height, flexShrink: 1, minHeight: COMPOSER_ONE_LINE, fontFamily: fontFamilyFor(inputClasses) }}
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
