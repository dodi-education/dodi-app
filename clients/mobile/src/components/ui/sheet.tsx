import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sheet } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

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
  const isReduced = useReduceMotion();
  return (
    <Modal visible={isOpen} transparent animationType={isReduced ? "none" : "fade"} onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        {/* A tap outside closes it; screen readers use escape (iOS) or back (Android). */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          className={cn("absolute inset-0", sheet.overlay)}
          onPress={onClose}
        />
        <View
          className={sheet.content}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            paddingBottom: 16 + insets.bottom,
            shadowColor: "#22384E",
            shadowOpacity: 0.14,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: -8 },
            elevation: 12,
          }}
        >
          <View className={sheet.handle} accessibilityElementsHidden importantForAccessibility="no" />
          {title ? (
            <Text accessibilityRole="header" className={sheet.title}>
              {title}
            </Text>
          ) : null}
          {description ? <Text className={sheet.description}>{description}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}
