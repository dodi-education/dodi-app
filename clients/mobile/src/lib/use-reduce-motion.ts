import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The OS reduce-motion setting (the web's prefers-reduced-motion), shared by
 * every animation. The OS answers asynchronously, so the first read is
 * `false`; one app-wide subscription keeps the answer, so views mounted after
 * it resolved (nearly all: `primeReduceMotion` runs at app start) start with
 * the right value instead of starting an animation and stopping it again.
 */
let isReduced: boolean | null = null;
let isSubscribed = false;
const listeners = new Set<() => void>();

function update(value: boolean): void {
  if (isReduced === value) return;
  isReduced = value;
  listeners.forEach((listener) => listener());
}

/** Subscribe to the setting once; call early (the root layout) so it has resolved before screens animate. */
export function primeReduceMotion(): void {
  if (isSubscribed) return;
  isSubscribed = true;
  AccessibilityInfo.addEventListener("reduceMotionChanged", update);
  void AccessibilityInfo.isReduceMotionEnabled().then(
    // A change event may have answered first; it is newer.
    (value) => isReduced === null && update(value),
    () => undefined,
  );
}

function subscribe(listener: () => void): () => void {
  primeReduceMotion();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The setting as last known (false until the OS has answered). */
export function isReduceMotionOn(): boolean {
  return isReduced ?? false;
}

/**
 * Whether the OS asks for reduced motion. Animations read it when they start:
 * a running animation is not restarted when the value flips (hold it in a ref,
 * or gate the start on it, rather than listing it as an effect dependency of a
 * one-shot animation).
 */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, isReduceMotionOn, isReduceMotionOn);
}
