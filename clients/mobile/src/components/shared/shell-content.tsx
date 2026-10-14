import type { ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Refresher } from "@dodi/client-state/pull-refresh";
import { PARENT_TOP_BAR_HEIGHT, shellContent } from "@dodi/ui-recipes";

import { useRefreshControl } from "@/components/shared/refresh-control";
import { cn } from "@/lib/cn";
import { keyboardAvoidance } from "@/lib/keyboard-avoidance";
import { useRefreshOnPull } from "@/lib/refresh-scope";

/**
 * The scrolling content column inside the parent shell (web: max-w-[880px] px-4 py-5 pb-[72px]).
 *
 * `onRefresh` turns on pull to refresh (app-only; browsers have their own
 * reload): a pull runs it together with every reload the screen's parts
 * registered (`useRefreshOnPull`). Pass it on every render of a screen or
 * never: toggling the control re-mounts the content.
 */
export function ShellContent({
  children,
  className,
  onRefresh,
}: {
  children: ReactNode;
  className?: string;
  onRefresh?: Refresher;
}) {
  useRefreshOnPull("screen", onRefresh);
  const refreshControl = useRefreshControl();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      className="flex-1"
      // Pads on both platforms (edge to edge, Android's window no longer resizes). The column
      // sits under the shell's top bar and pads no safe-area inset (its bottom padding is fixed).
      {...keyboardAvoidance({ top: PARENT_TOP_BAR_HEIGHT + insets.top, bottomInset: 0 })}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName={cn(shellContent, className)}
        refreshControl={onRefresh ? refreshControl : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
