import { useRef, useState } from "react";
import { type GestureResponderEvent, Modal, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { companionVolume as v } from "@dodi/ui-recipes";

import { Icon } from "@/components/ui";
import { useActiveKidStore, useCompanionVolumeStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useDodiSessionStore } from "@/lib/dodi-session-store";
import { useReduceMotion } from "@/lib/use-reduce-motion";

import { kidShadowStyle } from "./kid-shadow";
import { KidText } from "./kid-text";

const STEP = 0.1;

/**
 * The volume slider (web: a native range input, 0..100). Drag or tap along the
 * track; screen readers adjust it in 10% steps.
 */
function VolumeSlider({
  value,
  disabled,
  label,
  onChange,
}: {
  value: number;
  disabled: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const setFromTouch = (event: GestureResponderEvent): void => {
    if (width <= 0) return;
    onChange(Math.min(1, Math.max(0, event.nativeEvent.locationX / width)));
  };
  const percent = Math.round(value * 100);
  const thumbLeft = Math.max(0, Math.min(width - v.thumbSize, value * width - v.thumbSize / 2));

  return (
    <View
      className={cn(v.slider, disabled && v.sliderDisabled)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        const delta = event.nativeEvent.actionName === "increment" ? STEP : -STEP;
        onChange(Math.min(1, Math.max(0, Math.round((value + delta) * 10) / 10)));
      }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={setFromTouch}
      onResponderMove={setFromTouch}
    >
      <View className={v.track} pointerEvents="none" />
      <View className={v.fill} style={{ width: value * width }} pointerEvents="none" />
      <View className={v.thumb} style={[{ left: thumbLeft }, kidShadowStyle("sm")]} pointerEvents="none" />
    </View>
  );
}

/**
 * The kid's output-volume control in the header (web:
 * components/kid/companion-volume-control): a round button opening a flyout
 * with the volume slider and the mute-all toggle. The level is a per-kid
 * device preference; mute is the session's `setMuted` (kids.muted_dodi_at).
 * Both are output only: neither changes whether dodi listens.
 */
export function CompanionVolumeControl() {
  const t = useTranslations("games");
  const isReduced = useReduceMotion();
  const tProfile = useTranslations("kidProfile");

  const volume = useCompanionVolumeStore((s) => s.volume);
  const setVolume = useCompanionVolumeStore((s) => s.setVolume);
  const muted = useDodiSessionStore((s) => s.muted);
  const setMuted = useDodiSessionStore((s) => s.setMuted);
  const activeKidId = useActiveKidStore((s) => s.activeKidId);

  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<View | null>(null);
  const isOpen = anchor !== null;

  function toggle(): void {
    if (isOpen) {
      setAnchor(null);
      return;
    }
    // The flyout opens under the button (web: absolute left-0 top-full mt-2).
    buttonRef.current?.measureInWindow((x, y, _w, h) => setAnchor({ x, y: y + h + v.flyoutGap }));
  }

  const iconName = muted ? "volume_off" : volume <= 0.5 ? "volume_low" : "volume";

  return (
    <View className={v.root}>
      <Pressable
        ref={buttonRef}
        accessibilityRole="button"
        accessibilityLabel={t("voiceVolumeOpen")}
        accessibilityState={{ expanded: isOpen }}
        onPress={toggle}
        className={cn(v.button, "active:opacity-80")}
        style={kidShadowStyle("sm")}
      >
        <Icon name={iconName} size={v.icon} color={muted ? "danger" : "foreground"} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType={isReduced ? "none" : "fade"} onRequestClose={() => setAnchor(null)} statusBarTranslucent>
        {/* Outside tap closes (web: pointerdown outside / Escape). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tProfile("close")}
          className="absolute inset-0"
          onPress={() => setAnchor(null)}
        />
        {anchor ? (
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => setAnchor(null)}
            accessibilityLabel={t("voiceVolume")}
            className={v.flyout}
            style={[{ position: "absolute", left: anchor.x, top: anchor.y, width: v.flyoutWidth }, kidShadowStyle("lg")]}
          >
            <KidText className={v.label}>{t("voiceVolume")}</KidText>
            <VolumeSlider value={muted ? 0 : volume} disabled={muted} label={t("voiceVolume")} onChange={setVolume} />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: muted }}
              onPress={() => setMuted(!muted, activeKidId ?? undefined)}
              className={cn(v.mute, muted ? v.muteOn : v.muteOff)}
            >
              <Icon name={muted ? "volume" : "volume_off"} size={v.muteIcon} color={muted ? "danger" : "ink-2"} />
              <KidText className={cn(v.muteText, muted ? v.muteOnText : v.muteOffText)}>
                {muted ? t("voiceUnmuteAll") : t("voiceMuteAll")}
              </KidText>
            </Pressable>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
