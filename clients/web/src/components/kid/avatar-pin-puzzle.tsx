"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { PIN_SHAKE_MS } from "@dodi/client-state/kid-view";

import { PIN_LENGTH, PIN_PALETTE, avatarImage } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { pinPuzzle } from "@dodi/ui-recipes";

type Slots = (string | null)[];
const emptySlots = (): Slots => Array<string | null>(PIN_LENGTH).fill(null);

interface BaseProps {
  /** Palette of avatar ids to choose from (defaults to the curated 8). */
  palette?: string[];
  className?: string;
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
 * The avatar-PIN puzzle: 3 slots filled by tapping avatars from a palette.
 * `solve` mode auto-verifies on the 3rd tap (shake + reset on a wrong sequence);
 * `set` mode is controlled and just reports the chosen slots for the parent.
 */
export function AvatarPinPuzzle(props: AvatarPinPuzzleProps) {
  const t = useTranslations("kidProfile");
  const palette = props.palette ?? PIN_PALETTE;
  const [internal, setInternal] = useState<Slots>(emptySlots);
  const [activeSlot, setActiveSlot] = useState(0);
  const [shake, setShake] = useState(false);

  const slots = props.mode === "set" ? props.value : internal;

  function place(avatarId: string) {
    if (shake) return;
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
        setShake(true);
        setTimeout(() => {
          setInternal(emptySlots());
          setActiveSlot(0);
          setShake(false);
        }, PIN_SHAKE_MS);
      }
    } else {
      setActiveSlot(nextEmpty);
    }
  }

  return (
    <div className={props.className}>
      <div
        className={cn(
          pinPuzzle.slots,
          pinPuzzle.webSlots,
          shake && pinPuzzle.webShake,
        )}
      >
        {slots.map((s, i) => {
          const isActive = i === activeSlot && !s;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveSlot(i)}
              className={cn(
                pinPuzzle.slot,
                pinPuzzle.webSlot,
                s
                  ? pinPuzzle.slotFilled
                  : isActive
                    ? pinPuzzle.slotActive
                    : pinPuzzle.slotEmpty,
              )}
              aria-label={t("slotLabel", { n: i + 1 })}
            >
              {s ? (
                <Image
                  src={avatarImage(s)!}
                  alt=""
                  width={62}
                  height={62}
                  unoptimized
                  className={cn(pinPuzzle.slotImage, pinPuzzle.webSlotImage)}
                />
              ) : (
                <span
                  className={cn(
                    pinPuzzle.dot,
                    isActive ? pinPuzzle.dotActive : pinPuzzle.dotIdle,
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className={cn(pinPuzzle.palette, pinPuzzle.webPalette)}>
        {palette.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => place(id)}
            className={cn(pinPuzzle.tile, pinPuzzle.webTile)}
            aria-label={id}
          >
            <Image
              src={avatarImage(id)!}
              alt=""
              width={64}
              height={64}
              unoptimized
              className={cn(pinPuzzle.tileImage, pinPuzzle.webTileImage)}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
