import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Screen-reader announcements. A status that changes in place (dodi's speech
 * bubble, the studio's status line) sits in an `accessibilityLiveRegion`,
 * which TalkBack reads on change; iOS has no live regions, so VoiceOver gets
 * the same text spoken through `useAnnounceOnIos`. A discrete event that
 * mounts new views (a chat reply) is not a change to an existing region, so
 * `announce` speaks it on both platforms.
 */
export function announce(message: string): void {
  const text = message.trim();
  if (!text) return;
  void AccessibilityInfo.isScreenReaderEnabled().then((isOn) => {
    if (isOn) AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  });
}

/**
 * Speaks `message` on iOS whenever it changes after mount (the first value is
 * on screen to be found, not news; `isNewOnMount` for a view that only mounts
 * when there is news, like a form error). Pair it with
 * `accessibilityLiveRegion` on the view showing the text, which covers Android.
 */
export function useAnnounceOnIos(message: string | null | undefined, { isNewOnMount = false } = {}): void {
  const last = useRef(isNewOnMount ? null : (message ?? null));
  useEffect(() => {
    const next = message ?? null;
    if (next === last.current) return;
    last.current = next;
    if (Platform.OS === "ios" && next) announce(next);
  }, [message]);
}
