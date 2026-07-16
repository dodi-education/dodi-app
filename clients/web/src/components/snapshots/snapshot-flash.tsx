"use client";

import { useEffect, useRef, useState } from "react";

// public/ asset — the folder must stay excluded in the middleware matcher.
const SNAPSHOT_SOUND_URL = "/sounds/snapshot.mp3";

/**
 * iOS-screenshot-style feedback for a manually saved snapshot: the captured
 * image appears over the game stage, shrinks down to a 100×100 card hovering
 * above the Snapshots item in the kid nav, holds a beat, and fades away —
 * showing the kid where their snapshot went. Plays the shutter sound on mount.
 */

const FLY_MS = 650;
const HOLD_MS = 400;
const FADE_MS = 250;
const TARGET_SIZE = 100;
const TARGET_GAP = 12;

interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SnapshotFlashProps {
  /** The captured game image (data URL). */
  image: string;
  /** Viewport rect of the game stage at capture time — the animation start. */
  startRect: FrameRect;
  /** Unmount callback once the flash has fully faded. */
  onDone: () => void;
}

/** 100×100 landing spot centered above the Snapshots nav item. */
function snapshotTargetRect(): FrameRect {
  const navItem = document.querySelector('[data-kid-nav="/snapshots"]');
  if (navItem) {
    const rect = navItem.getBoundingClientRect();
    return {
      left: rect.left + rect.width / 2 - TARGET_SIZE / 2,
      top: rect.top - TARGET_SIZE - TARGET_GAP,
      width: TARGET_SIZE,
      height: TARGET_SIZE,
    };
  }
  // No kid nav on this page — land bottom-center instead.
  return {
    left: window.innerWidth / 2 - TARGET_SIZE / 2,
    top: window.innerHeight - TARGET_SIZE - TARGET_GAP,
    width: TARGET_SIZE,
    height: TARGET_SIZE,
  };
}

export function SnapshotFlash({ image, startRect, onDone }: SnapshotFlashProps) {
  // Only ever mounted client-side, after a capture — window is available.
  // Reduced motion skips the flight: the card appears right at its landing
  // spot and just fades.
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [frame, setFrame] = useState<FrameRect>(() =>
    reducedMotion ? snapshotTargetRect() : startRect,
  );
  const [flying, setFlying] = useState(false);
  const [faded, setFaded] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const audio = new Audio(SNAPSHOT_SOUND_URL);
    // Best-effort shutter sound — autoplay policy may block it before the
    // page's first gesture.
    audio.play().catch(() => {});

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let raf = 0;

    if (!reducedMotion) {
      // Double rAF: guarantee one paint at the stage rect so the shrink
      // transition has a starting frame to animate from.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          setFlying(true);
          setFrame(snapshotTargetRect());
        });
      });
    }
    timers.push(setTimeout(() => setFaded(true), FLY_MS + HOLD_MS));
    timers.push(setTimeout(() => onDoneRef.current(), FLY_MS + HOLD_MS + FADE_MS));

    return () => {
      cancelAnimationFrame(raf);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [reducedMotion]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      {/* Raw <img>: next/image can't animate its box like this. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        className="absolute rounded-[16px] border-[3px] border-white object-cover shadow-[0_10px_30px_rgba(34,56,78,0.35)]"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          opacity: faded ? 0 : 1,
          transition: flying
            ? `left ${FLY_MS}ms cubic-bezier(0.32, 0.72, 0.35, 1), top ${FLY_MS}ms cubic-bezier(0.32, 0.72, 0.35, 1), width ${FLY_MS}ms cubic-bezier(0.32, 0.72, 0.35, 1), height ${FLY_MS}ms cubic-bezier(0.32, 0.72, 0.35, 1), opacity ${FADE_MS}ms ease-out`
            : `opacity ${FADE_MS}ms ease-out`,
        }}
      />
    </div>
  );
}
