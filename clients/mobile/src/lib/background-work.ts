/**
 * Shares the OS background session (the native `background-build` module:
 * iOS continued processing / short task, Android foreground service) between
 * everything in the Game Studio that must survive the parent switching apps:
 * a build, and the planning turns (a plan reply, deriving a plan's settings).
 *
 * The native module tracks one session, and a plan turn can overlap a build of
 * another game, so this counts holders: the first one starts the session, the
 * last one ends it, and while a build holds it the build drives the progress.
 */
import {
  finishBackgroundBuild,
  onBackgroundBuildExpire,
  startBackgroundBuild,
  updateBackgroundBuild,
} from "../../modules/background-build";

export type BackgroundWorkKind = "build" | "plan";

export interface BackgroundWorkHold {
  /** 0..1 plus a short status line. Only the build's updates reach the OS while one runs. */
  update(progress: number, subtitle: string): void;
  /** Done; the last holder ends the OS session (`isSuccess` is shown by iOS). */
  release(isSuccess: boolean): void;
}

interface Holder {
  kind: BackgroundWorkKind;
  onExpire?: () => void;
}

const holders = new Set<Holder>();

function drivesProgress(holder: Holder): boolean {
  // A build's progress wins; a plan turn only drives it when no build runs.
  return holder.kind === "build" || ![...holders].some((other) => other.kind === "build");
}

/**
 * Keep work running while the app is in the background. `onExpire` runs when
 * the OS is about to suspend the app (time is up): stop at a safe point.
 */
export function holdBackgroundWork(
  kind: BackgroundWorkKind,
  status: { title: string; subtitle: string },
  onExpire?: () => void,
): BackgroundWorkHold {
  const holder: Holder = { kind, onExpire };
  const isFirst = holders.size === 0;
  holders.add(holder);
  if (isFirst) void startBackgroundBuild(status.title, status.subtitle);
  else if (kind === "build") updateBackgroundBuild(0, status.subtitle);

  let isReleased = false;
  return {
    update(progress, subtitle) {
      if (!isReleased && drivesProgress(holder)) updateBackgroundBuild(progress, subtitle);
    },
    release(isSuccess) {
      if (isReleased) return;
      isReleased = true;
      holders.delete(holder);
      if (holders.size === 0) finishBackgroundBuild(isSuccess);
    },
  };
}

onBackgroundBuildExpire(() => {
  for (const holder of [...holders]) holder.onExpire?.();
});
