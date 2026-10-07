import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { dialog } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

import { Text } from "./text";

/** The web's Dialog on a phone: centered, title + description, stacked actions. */
export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Actions, primary first (rendered stacked, primary on top). */
  footer?: ReactNode;
}) {
  const isReduced = useReduceMotion();
  return (
    <Modal visible={isOpen} transparent animationType={isReduced ? "none" : "fade"} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 items-center justify-center px-4">
        {/* A tap outside closes it; screen readers use escape (iOS) or back (Android). */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          className={cn("absolute inset-0", dialog.overlay)}
          onPress={onClose}
        />
        <View className={dialog.content} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <View className={dialog.header}>
            <Text accessibilityRole="header" className={dialog.title}>
              {title}
            </Text>
            {description ? <Text className={dialog.description}>{description}</Text> : null}
          </View>
          {children}
          {footer ? <View className="gap-2">{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
