import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";
import { PIN_LENGTH, PIN_PALETTE } from "@dodi/client-state/avatars";
import { PIN_SHAKE_MS } from "@dodi/client-state/kid-view";
import { pinPuzzle } from "@dodi/ui-recipes";

import { avatarImage } from "@/lib/avatar-images";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";

type Slots = (string | null)[];
const emptySlots = (): Slots => Array<string | null>(PIN_LENGTH).fill(null);

/** The web's kPinShake: translateX keyframes over 0.5s. */
const SHAKE_STEPS = [-2, 4, -9, 9, -9, 9, -9, 4, -2, 0];

interface BaseProps {
  /** Palette of avatar ids to choose from (defaults to the curated 8). */
  palette?: string[];
}
interface SolveProps extends BaseProps {
  mode: "solve";
  /** Called once all slots are filled. Return true to accept, false to shake + reset. */
  onSolve: (sequence: string[]) => boolean;
}
interface SetProps extends BaseProps {
  mode: "set";
  /** Controlled slot values (length {@link PIN_LENGTH}). */
  value: Slots;
  onChange: (slots: Slots) => void;
}
type AvatarPinPuzzleProps = SolveProps | SetProps;

/**
 * The avatar-PIN puzzle (web: components/kid/avatar-pin-puzzle): 3 slots
 * filled by tapping avatars from a palette. `solve` mode auto-verifies on the
 * 3rd tap (shake + reset on a wrong sequence; no shake under reduced motion);
 * `set` mode is controlled and just reports the chosen slots.
 */
export function AvatarPinPuzzle(props: AvatarPinPuzzleProps) {
  const t = useTranslations("kidProfile");
  const palette = props.palette ?? PIN_PALETTE;
  const [internal, setInternal] = useState<Slots>(emptySlots);
  const [activeSlot, setActiveSlot] = useState(0);
  const [isShaking, setIsShaking] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const isReduced = useReduceMotion();
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paletteWidth, setPaletteWidth] = useState(0);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const slots = props.mode === "set" ? props.value : internal;

  function runShake(): void {
    if (isReduced) return;
    shake.setValue(0);
    Animated.sequence(
      SHAKE_STEPS.map((toValue) =>
        Animated.timing(shake, {
          toValue,
          duration: 50,
          easing: Easing.bezier(0.36, 0.07, 0.19, 0.97),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }

  function place(avatarId: string): void {
    if (isShaking) return;
    const next = slots.slice();
    next[activeSlot] = avatarId;
    const nextEmpty = next.findIndex((s) => s == null);

    if (props.mode === "set") {
      props.onChange(next);
      setActiveSlot(nextEmpty === -1 ? activeSlot : nextEmpty);
      return;
    }

    setInternal(next);
    if (nextEmpty === -1) {
      const ok = props.onSolve(next as string[]);
      if (!ok) {
        setIsShaking(true);
        runShake();
        resetTimer.current = setTimeout(() => {
          setInternal(emptySlots());
          setActiveSlot(0);
          setIsShaking(false);
        }, PIN_SHAKE_MS);
      }
    } else {
      setActiveSlot(nextEmpty);
    }
  }

  // Four tiles per row with gap-2.5 (10px), like the web's grid-cols-4.
  const tileSize = paletteWidth > 0 ? (paletteWidth - 3 * 10) / 4 : 0;

  return (
    <View>
      <Animated.View className={pinPuzzle.slots} style={{ transform: [{ translateX: shake }] }}>
        {slots.map((s, i) => {
          const isActive = i === activeSlot && !s;
          const image = s ? avatarImage(s) : null;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={t("slotLabel", { n: i + 1 })}
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveSlot(i)}
              className={cn(
                pinPuzzle.slot,
                s ? pinPuzzle.slotFilled : isActive ? pinPuzzle.slotActive : pinPuzzle.slotEmpty,
              )}
            >
              {image ? (
                <Image source={image} className={pinPuzzle.slotImage} resizeMode="contain" />
              ) : (
                <View className={cn(pinPuzzle.dot, isActive ? pinPuzzle.dotActive : pinPuzzle.dotIdle)} />
              )}
            </Pressable>
          );
        })}
      </Animated.View>
      <View className={pinPuzzle.palette} onLayout={(e) => setPaletteWidth(e.nativeEvent.layout.width)}>
        {tileSize > 0
          ? palette.map((id) => {
              const image = avatarImage(id);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={id}
                  onPress={() => place(id)}
                  className={cn(pinPuzzle.tile, "active:bg-primary-soft")}
                  style={{ width: tileSize }}
                >
                  {image ? <Image source={image} className={pinPuzzle.tileImage} resizeMode="contain" /> : null}
                </Pressable>
              );
            })
          : null}
      </View>
    </View>
  );
}
