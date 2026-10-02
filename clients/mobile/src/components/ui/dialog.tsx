import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { dialog } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

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
  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 items-center justify-center px-4">
        <Pressable accessibilityLabel={title} className={cn("absolute inset-0", dialog.overlay)} onPress={onClose} />
        <View className={dialog.content} accessibilityViewIsModal>
          <View className={dialog.header}>
            <Text className={dialog.title}>{title}</Text>
            {description ? <Text className={dialog.description}>{description}</Text> : null}
          </View>
          {children}
          {footer ? <View className="gap-2">{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
