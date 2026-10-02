import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sheet } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { Text } from "./text";

/** The web's bottom Sheet: rounded top, grab handle, safe-area bottom padding. */
export function Sheet({
  isOpen,
  onClose,
  title,
  description,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable accessibilityLabel={title} className={cn("absolute inset-0", sheet.overlay)} onPress={onClose} />
        <View
          className={sheet.content}
          style={{
            paddingBottom: 16 + insets.bottom,
            shadowColor: "#22384E",
            shadowOpacity: 0.14,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: -8 },
            elevation: 12,
          }}
        >
          <View className={sheet.handle} />
          {title ? <Text className={sheet.title}>{title}</Text> : null}
          {description ? <Text className={sheet.description}>{description}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}
