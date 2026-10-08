import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";
import { authLayout } from "@dodi/ui-recipes";
import { legalUrl, SETTINGS_LEGAL_PAGES } from "@dodi/client-state/legal-links";

import { Text } from "@/components/ui";
import { SITE_URL } from "@/lib/env";
import { useLocaleSetting } from "@/lib/intl";

import { PageBackground } from "./page-background";

const LEGAL_LABEL_KEYS: Record<(typeof SETTINGS_LEGAL_PAGES)[number], string> = {
  privacy: "legalPrivacy",
  terms: "legalTerms",
  imprint: "legalImprint",
};

/** Privacy policy, terms and imprint under the card (web: components/auth/auth-legal-links). */
function AuthLegalLinks() {
  const t = useTranslations("settings");
  const { locale } = useLocaleSetting();
  return (
    <View className={authLayout.legal}>
      {SETTINGS_LEGAL_PAGES.map((page) => (
        <Pressable
          key={page}
          accessibilityRole="link"
          hitSlop={14}
          onPress={() => void Linking.openURL(legalUrl(SITE_URL, page, locale))}
          className="active:opacity-70"
        >
          <Text className={authLayout.legalLink}>{t(LEGAL_LABEL_KEYS[page])}</Text>
        </Pressable>
      ))}
    </View>
  );
}

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
          <View className={authLayout.container}>
            {children}
            <AuthLegalLinks />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PageBackground>
  );
}
