import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cn } from "@/lib/cn";

/** A scrolling, keyboard-aware page on the app background. */
export function Screen({
  children,
  className,
  isCentered = false,
}: {
  children: ReactNode;
  className?: string;
  isCentered?: boolean;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={cn(
            "grow px-5 py-6",
            isCentered && "justify-center",
          )}
        >
          <View className={cn("w-full max-w-xl self-center gap-4", className)}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
