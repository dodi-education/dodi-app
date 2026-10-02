import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { shellContent } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

/** The scrolling content column inside the parent shell (web: max-w-[880px] px-4 py-5 pb-[72px]). */
export function ShellContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName={cn(shellContent, className)}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
