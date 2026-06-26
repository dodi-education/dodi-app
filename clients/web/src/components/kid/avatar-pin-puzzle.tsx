"use client";

import Image from "next/image";
import { useState } from "react";

import { PIN_LENGTH, PIN_PALETTE, avatarSrc } from "@/lib/avatars";
import { cn } from "@/lib/utils";

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
        }, 520);
      }
    } else {
      setActiveSlot(nextEmpty);
    }
  }

  return (
    <div className={props.className}>
      <div
        className={cn(
          "mb-[18px] flex justify-center gap-3.5",
          shake && "animate-pin-shake",
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
                "flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[18px] border-[2.5px] transition-colors",
                s
                  ? "border-solid border-primary bg-white"
                  : isActive
                    ? "border-solid border-primary bg-primary-soft"
                    : "border-dashed border-border bg-muted",
              )}
              aria-label={`Slot ${i + 1}`}
            >
              {s ? (
                <Image
                  src={avatarSrc(s)}
                  alt=""
                  width={62}
                  height={62}
                  className="h-full w-full object-contain p-[5px]"
                />
              ) : (
                <span
                  className={cn(
                    "h-3 w-3 rounded-full",
                    isActive ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {palette.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => place(id)}
            className="aspect-square overflow-hidden rounded-[14px] bg-muted p-[5px] transition hover:-translate-y-0.5 hover:bg-primary-soft"
            aria-label={id}
          >
            <Image
              src={avatarSrc(id)}
              alt=""
              width={64}
              height={64}
              className="h-full w-full object-contain"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
