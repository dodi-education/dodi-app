import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageBackground } from "@/components/shared/page-background";
import { cn } from "@/lib/cn";

/**
 * A full-height, vertically centered column over the page gradient: the web's
 * `mx-auto flex min-h-screen max-w-… flex-col justify-center` pages that sit
 * outside the (auth) layout (vault-setup, onboarding) and the gates' prompts.
 * Unlike AuthLayout it has no logo row. `className` is the column's classes,
 * `pageClassName` the outer page's (e.g. the web's `px-4` around a column).
 */
export function CenteredPage({
  className,
  pageClassName,
  children,
}: {
  className?: string;
  pageClassName?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <PageBackground>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={cn("items-center justify-center", pageClassName)}
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <View className={cn("w-full", className)}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </PageBackground>
  );
}
