import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { companionCompact as c } from "@dodi/ui-recipes";

import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useConnectivityStore } from "@/lib/client-state";
import { selectDodiActivityKind, selectDodiThinking, useDodiSessionStore } from "@/lib/dodi-session-store";
import { useAnnounceOnIos } from "@/lib/announce";
import { useReduceMotion } from "@/lib/use-reduce-motion";

import { getDodiImage } from "./dodi-image";
import { useCompanionStateLabel } from "./use-companion-state-label";

/** A looping 0 → 1 value (still under reduced motion), while `isOn`. */
function useLoopValue(isOn: boolean, make: (value: Animated.Value) => Animated.CompositeAnimation): Animated.Value {
  const [value] = useState(() => new Animated.Value(0));
  const isReduced = useReduceMotion();
  useEffect(() => {
    if (!isOn || isReduced) return;
    value.setValue(0);
    const loop = Animated.loop(make(value));
    loop.start();
    return () => {
      loop.stop();
      value.setValue(0); // at rest if reduced motion stops it mid-way
    };
    // `make` is a fresh closure every render; the loop is set up per switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isOn, isReduced]);
  return value;
}

/**
 * The header's compact dodi (web: components/dodi/dodi-compact): the voice
 * session's toggle (listen on/off, wake, reconnect) with the status ring and
 * dot, and a status bubble while dodi is doing something.
 */
export function DodiCompact() {
  const t = useTranslations("games");

  const dodiState = useDodiSessionStore((s) => s.state);
  const dodiSpeaking = useDodiSessionStore((s) => s.dodiSpeaking);
  const error = useDodiSessionStore((s) => s.error);
  const toggleActive = useDodiSessionStore((s) => s.toggleActive);
  const isThinking = useDodiSessionStore(selectDodiThinking);
  const activityKind = useDodiSessionStore(selectDodiActivityKind);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const stateLabel = useCompanionStateLabel();

  const isConnected = dodiState === "active" || dodiState === "deaf";
  const isConnecting = dodiState === "connecting";

  // animate-kspin (thinking head), animate-ping (speaking), animate-spin (connecting).
  const spin = useLoopValue(isThinking || isConnecting, (v) =>
    Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
  );
  const ping = useLoopValue(dodiSpeaking, (v) =>
    Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }),
  );
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const ariaLabel =
    dodiState === "connecting"
      ? t("voiceAriaConnecting")
      : dodiState === "active"
        ? t("voiceAriaStopListening")
        : dodiState === "deaf"
          ? t("voiceAriaStartListening")
          : dodiState === "sleep"
            ? t("voiceAriaWake")
            : error
              ? t("voiceAriaReconnect")
              : t("voiceAriaStart");

  // Transient status in the bubble; idle states (listening, deaf, disconnected)
  // show none: the badge already conveys them.
  const statusLine =
    activityKind === "image"
      ? t("voiceCreatingImage")
      : activityKind === "writing"
        ? t("voiceWritingText")
        : activityKind === "thinking"
          ? t("voiceThinking")
          : isConnecting
            ? t("voiceConnecting")
            : dodiSpeaking && dodiState === "active"
              ? t("voiceSpeaking")
              : null;
  // "Speaking" is not announced: dodi's voice says it, and a screen reader
  // talking over it (into the open microphone) would only get in the way.
  const isSpeakingLine = statusLine !== null && statusLine === t("voiceSpeaking");
  useAnnounceOnIos(isSpeakingLine ? null : statusLine);

  return (
    <View className={c.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ariaLabel}
        accessibilityValue={{ text: stateLabel }}
        accessibilityState={{ disabled: isConnecting, busy: isConnecting || isThinking }}
        onPress={toggleActive}
        disabled={isConnecting}
        // 40pt button: widen the target to 44pt+ for small hands.
        hitSlop={4}
        className={cn(c.button, isConnecting && c.disabled)}
        style={kidShadowStyle("sm")}
      >
        <Animated.Image
          accessibilityElementsHidden
          importantForAccessibility="no"
          source={getDodiImage(dodiState, true, isThinking)}
          style={{ width: c.head, height: c.head, transform: isThinking ? [{ rotate }] : [] }}
          className="rounded-full"
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        {/* Speaking ring */}
        {dodiSpeaking ? (
          <Animated.View
            pointerEvents="none"
            className={c.speakingRing}
            style={{
              transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
              opacity: ping.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.4, 0, 0] }),
            }}
          />
        ) : null}
        {/* Connecting spinner */}
        {isConnecting ? (
          <Animated.View pointerEvents="none" className={c.connectingRing} style={{ transform: [{ rotate }] }} />
        ) : null}
        {/* Status dot / offline badge */}
        {!isOnline ? (
          <View className={c.offlineBadge} pointerEvents="none">
            <Icon name="wifi_off" size={c.offlineIcon} color="muted-foreground" />
          </View>
        ) : (
          <>
            {isConnected ? <View pointerEvents="none" className={cn(c.statusDot, c.connectedDot)} /> : null}
            {dodiState === "disconnected" && error ? (
              <View pointerEvents="none" className={cn(c.statusDot, c.errorDot)} />
            ) : null}
          </>
        )}
      </Pressable>

      {/* Status bubble: a persistent live region, so screen readers announce
          changes; only visible while dodi is doing something. */}
      <View className={c.liveRegion} accessibilityLiveRegion="polite">
        {statusLine ? (
          <View
            className={c.bubble}
            style={kidShadowStyle("sm")}
            importantForAccessibility={isSpeakingLine ? "no-hide-descendants" : "auto"}
            accessibilityElementsHidden={isSpeakingLine}
          >
            {/* Tail pointing left toward the avatar */}
            <View className={c.bubbleTail} style={{ marginTop: c.bubbleTailOffset }} />
            <KidText className={c.bubbleText} numberOfLines={1}>
              {statusLine}
            </KidText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
