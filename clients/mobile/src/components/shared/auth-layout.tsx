import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authLayout } from "@dodi/ui-recipes";

import { Text } from "@/components/ui";

import { PageBackground } from "./page-background";

/** The web's (auth) layout: logo row and one centered column over the gradient. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <PageBackground>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={authLayout.root}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 48 + insets.top, paddingBottom: 48 + insets.bottom }}
        >
          <View className={authLayout.logo}>
            <Image
              source={require("../../../assets/images/splash.png")}
              style={{ width: authLayout.logoHeadSize, height: authLayout.logoHeadSize }}
              accessibilityIgnoresInvertColors
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text className={authLayout.logoText}>dodi</Text>
          </View>
          <View className={authLayout.container}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PageBackground>
  );
}
