import type { ReactElement } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";
import type { RefreshRegistry } from "@dodi/client-state/pull-refresh";
import { COLORS } from "@dodi/design-tokens";

import { useRefreshScope } from "@/lib/refresh-scope";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";

/**
 * The native pull-to-refresh control for a vertical ScrollView's
 * `refreshControl` (Android SwipeRefreshLayout, iOS UIRefreshControl). Both
 * only start the gesture when the content is scrolled to its top, so list
 * scrolling is never affected; never put one on a horizontal scroller.
 *
 * Pass it unconditionally for a given scroll view: adding or removing a
 * refresh control re-mounts the scroll view's content. `registry` defaults to
 * the nearest scope; `progressViewOffset` keeps the spinner clear of whatever
 * sits over the scroll view's top (the status bar in the kid chrome).
 */
export function useRefreshControl({
  registry,
  progressViewOffset,
}: { registry?: RefreshRegistry | null; progressViewOffset?: number } = {}): ReactElement<RefreshControlProps> {
  const scoped = useRefreshScope();
  const { refreshing, onRefresh } = usePullToRefresh(registry ?? scoped);
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={COLORS.primary}
      colors={[COLORS.primary]}
      progressBackgroundColor={COLORS.card}
      progressViewOffset={progressViewOffset}
    />
  );
}
