/**
 * Keeps a Game Studio build running while the parent uses other apps.
 *
 * - iOS 26+: a BGContinuedProcessingTask (the system shows its progress UI).
 * - iOS 17–25: beginBackgroundTask, about 30 s; then `onExpire` fires, the
 *   build pauses at its checkpoint and resumes when the app returns.
 * - Android: a dataSync foreground service with a progress notification.
 *
 * Without the native module (Expo Go, tests) every call is a no-op.
 */
import { type EventSubscription, requireOptionalNativeModule } from "expo-modules-core";

export type BackgroundMode = "continued-processing" | "short-task" | "foreground-service" | "none";

interface BackgroundBuildNative {
  /** Starts protecting the build; resolves with the mode the OS granted. */
  start(title: string, subtitle: string): Promise<BackgroundMode>;
  /** 0..1 plus a short status line (the current build step). */
  update(progress: number, subtitle: string): void;
  /** Ends protection (success or not). */
  finish(isSuccess: boolean): void;
  addListener(event: "onExpire", listener: () => void): EventSubscription;
}

const native = requireOptionalNativeModule<BackgroundBuildNative>("BackgroundBuild");

/** The native module is present, so a build keeps running when the app is left. */
export function isBackgroundBuildAvailable(): boolean {
  return native !== null;
}

export function startBackgroundBuild(title: string, subtitle: string): Promise<BackgroundMode> {
  return native ? native.start(title, subtitle) : Promise.resolve("none");
}

export function updateBackgroundBuild(progress: number, subtitle: string): void {
  native?.update(Math.max(0, Math.min(1, progress)), subtitle);
}

export function finishBackgroundBuild(isSuccess: boolean): void {
  native?.finish(isSuccess);
}

/** The OS is about to suspend the build (time is up): pause it at its checkpoint now. */
export function onBackgroundBuildExpire(listener: () => void): () => void {
  if (!native) return () => {};
  const subscription = native.addListener("onExpire", listener);
  return () => subscription.remove();
}
